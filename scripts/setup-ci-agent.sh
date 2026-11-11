#!/usr/bin/env bash
# AgentShield CI identity for the local Jenkins pipeline (Jenkinsfile, ci/jenkins/README.md).
# Local development use only.
#
#   scripts/setup-ci-agent.sh
#
# Registers the agent "jenkins-ci-agent" (or reuses it and rotates its key), reuses or registers the tools
# docker (OTHER), http (HTTP) and filesystem (FILESYSTEM), and grants exactly:
#   docker      WRITE, EXTERNAL_REQUEST   (build, push, deploy)
#   http        READ                      (smoke test)
#   filesystem  READ                      (so the ATTACK stage is denied by POLICY, not by a missing grant)
#
# Needs AGENTSHIELD_ADMIN_API_KEY in the environment (set -a && source .env && set +a).
# The agent API key is written to ~/.agentshield-ci/env (mode 0600) and never printed.
# Running this again rotates the key: update the Jenkins credential afterwards.
set -euo pipefail

BACKEND="${AGENTSHIELD_BACKEND:-http://localhost:8081}"
AGENT_NAME="jenkins-ci-agent"
CREDENTIAL_ID="agentshield-ci-agent-key"
CI_DIR="$HOME/.agentshield-ci"
ENV_FILE="$CI_DIR/env"

if [ -z "${AGENTSHIELD_ADMIN_API_KEY:-}" ]; then
  echo "AGENTSHIELD_ADMIN_API_KEY is not set. Run: set -a && source .env && set +a" >&2
  exit 2
fi

TMP_DIR=$(mktemp -d)
trap 'rm -rf "$TMP_DIR"' EXIT
chmod 700 "$TMP_DIR"
BODY="$TMP_DIR/body.json"

# admin METHOD PATH [JSON] -> prints the HTTP status; the response body is left in $BODY (never echoed raw).
admin() {
  local method=$1 path=$2 data=${3:-}
  local args=(-sS -o "$BODY" -w '%{http_code}' -X "$method" "$BACKEND$path"
    -H "X-Admin-API-Key: $AGENTSHIELD_ADMIN_API_KEY" -H 'Content-Type: application/json')
  if [ -n "$data" ]; then args+=(-d "$data"); fi
  curl "${args[@]}" || { echo "Cannot reach the AgentShield backend at $BACKEND." >&2; exit 1; }
}

# field EXPR [ARGS...]: evaluates a Python expression over the JSON body in $BODY (d) and sys.argv (a).
field() {
  local expr=$1; shift
  python3 - "$BODY" "$expr" "$@" <<'PY'
import json, sys
with open(sys.argv[1]) as f:
    d = json.load(f)
a = sys.argv[3:]
if isinstance(d, dict) and isinstance(d.get("content"), list):
    d = d["content"]
v = eval(sys.argv[2], {"d": d, "a": a})
print("" if v is None else v)
PY
}

backend_message() { field 'd.get("message", "") if isinstance(d, dict) else ""' 2>/dev/null || true; }

fail() { # message status
  echo "$1 (HTTP $2). $(backend_message)" >&2
  exit 1
}

# ---------------------------------------------------------------- agent

echo "Agent '$AGENT_NAME'..."
status=$(admin POST /api/v1/agents "{\"name\":\"$AGENT_NAME\",\"description\":\"Local Jenkins pipeline (agentshield-guard)\"}")
if [ "$status" = "201" ]; then
  echo "  registered"
elif [ "$status" = "409" ]; then
  status=$(admin GET /api/v1/agents)
  [ "$status" = "200" ] || fail "Could not list agents" "$status"
  agent_id=$(field 'next((x["id"] for x in d if x["name"] == a[0]), "")' "$AGENT_NAME")
  [ -n "$agent_id" ] || { echo "The name is taken but the agent was not found in the list." >&2; exit 1; }
  agent_status=$(field 'next((x["status"] for x in d if x["name"] == a[0]), "")' "$AGENT_NAME")
  echo "  already registered (status $agent_status), rotating its key"
  status=$(admin POST "/api/v1/agents/$agent_id/rotate-key")
  [ "$status" = "200" ] || fail "Key rotation failed" "$status"
  if [ "$agent_status" != "ACTIVE" ]; then
    echo "  warning: the agent is $agent_status, so every request will be denied. Reactivate it in the console" >&2
    echo "  (Agents) or: PATCH /api/v1/agents/$agent_id/status {\"status\":\"ACTIVE\"}" >&2
  fi
else
  fail "Agent registration failed" "$status"
fi

agent_id=$(field 'd["id"]')
mkdir -p "$CI_DIR"
chmod 700 "$CI_DIR"
(
  umask 077
  # The key goes straight from the response file into the env file; it is never in a shell variable.
  python3 - "$BODY" "$ENV_FILE" "$BACKEND" "$AGENT_NAME" <<'PY'
import json, shlex, sys
body, path, backend, name = sys.argv[1:5]
with open(body) as f:
    d = json.load(f)
key = d.get("apiKey")
if not key:
    sys.exit("The backend response had no API key.")
with open(path, "w") as f:
    f.write(f"export AGENTSHIELD_GATEWAY_URL={shlex.quote(backend)}\n")
    f.write(f"export AGENTSHIELD_AGENT_ID={shlex.quote(name)}\n")
    f.write(f"export AGENTSHIELD_AGENT_UUID={shlex.quote(d['id'])}\n")
    f.write(f"export AGENTSHIELD_AGENT_API_KEY={shlex.quote(key)}\n")
PY
)
chmod 600 "$ENV_FILE"
: > "$BODY"
echo "  agent id: $agent_id (API key saved to $ENV_FILE, not shown)"

# ---------------------------------------------------------------- tools

tool_id() { # name type -> id, reusing an existing tool with that name
  local name=$1 type=$2 id status
  status=$(admin GET /api/v1/tools)
  [ "$status" = "200" ] || fail "Could not list tools" "$status"
  id=$(field 'next((t["id"] for t in d if t["name"] == a[0]), "")' "$name")
  if [ -z "$id" ]; then
    status=$(admin POST /api/v1/tools "{\"name\":\"$name\",\"toolType\":\"$type\"}")
    [ "$status" = "201" ] || fail "Could not register tool $name" "$status"
    id=$(field 'd["id"]')
    echo "  registered tool $name ($type)" >&2
  else
    echo "  tool $name already registered, reusing it" >&2
  fi
  echo "$id"
}

echo "Tools..."
docker_tool=$(tool_id docker OTHER)
http_tool=$(tool_id http HTTP)
fs_tool=$(tool_id filesystem FILESYSTEM)

# ---------------------------------------------------------------- grants

# grant TOOL_ID NAME ACTIONS_JSON: keeps an identical grant, otherwise replaces it with exactly these actions.
grant() {
  local tool=$1 name=$2 actions=$3 status existing
  status=$(admin GET "/api/v1/permissions/agent/$agent_id")
  [ "$status" = "200" ] || fail "Could not list grants" "$status"
  # "<grant id> True|False" for this tool's existing grant (False: different actions), or empty.
  existing=$(python3 - "$BODY" "$tool" "[$actions]" <<'PY'
import json, sys
with open(sys.argv[1]) as f:
    d = json.load(f)
want = sorted(json.loads(sys.argv[3]))
for p in d:
    if p["toolId"] == sys.argv[2]:
        print(p["id"], sorted(p["allowedActions"]) == want)
        break
PY
)
  if [ "${existing#* }" = "True" ]; then
    echo "  $name: [$actions] already granted"
    return
  fi
  if [ -n "$existing" ]; then
    status=$(admin DELETE "/api/v1/permissions/${existing%% *}")
    [ "$status" = "204" ] || fail "Could not replace the $name grant" "$status"
  fi
  status=$(admin POST /api/v1/permissions "{\"agentId\":\"$agent_id\",\"toolId\":\"$tool\",\"allowedActions\":[$actions]}")
  [ "$status" = "201" ] || fail "Could not grant $name" "$status"
  echo "  $name: [$actions] granted"
}

echo "Grants..."
grant "$docker_tool" docker     '"WRITE","EXTERNAL_REQUEST"'
grant "$http_tool"   http       '"READ"'
grant "$fs_tool"     filesystem '"READ"'

cat <<EOF

Done. Add the key to Jenkins as a credential (it is not shown here):

  1. Copy it to the clipboard without displaying it:
       ( . $ENV_FILE && printf %s "\$AGENTSHIELD_AGENT_API_KEY" | pbcopy )
  2. Jenkins (http://localhost:8080) > Manage Jenkins > Credentials > System > Global credentials > Add Credentials
       Kind: Secret text    Scope: Global    ID: $CREDENTIAL_ID    Secret: paste
  3. Clear the clipboard:  printf '' | pbcopy

Running this script again rotates the key; then update the credential's Secret the same way.
EOF
