#!/usr/bin/env bash
# AgentShield MCP proxy demo setup (docs/mcp-proxy.md). Local development use only.
#
#   scripts/setup-mcp-demo.sh [--rotate]
#
# 1. Registers the agent "claude-mcp-agent", or reuses it if the name is taken. A reused agent keeps the key already
#    saved in ~/.agentshield-mcp/env; its key is rotated only with --rotate, or when no saved key exists.
# 2. Registers the tool "filesystem" (FILESYSTEM) if it is missing, and grants the agent exactly READ and WRITE on it.
# 3. Writes ~/.agentshield-mcp/env (mode 0600; the key is never printed) and ~/.agentshield-mcp/run-proxy.sh, a small
#    wrapper that loads that file and starts the proxy, so no client config ever holds the key.
# 4. Creates mcp-proxy/.venv and installs sdk/python and mcp-proxy into it.
# 5. Prints the `claude mcp add` command and the Claude Desktop JSON snippet.
#
# Needs AGENTSHIELD_ADMIN_API_KEY in the environment (set -a && source .env && set +a), python3 (3.10+), and Node.js
# with npx for the filesystem server.
set -euo pipefail

BACKEND="${AGENTSHIELD_BACKEND:-http://localhost:8081}"
AGENT_NAME="claude-mcp-agent"
TOOL_NAME="filesystem"
SERVER_NAME="agentshield-filesystem"
MCP_DIR="$HOME/.agentshield-mcp"
ENV_FILE="$MCP_DIR/env"
WRAPPER="$MCP_DIR/run-proxy.sh"
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VENV="$REPO/mcp-proxy/.venv"
CONFIG="$REPO/mcp-proxy/configs/filesystem.yaml"

ROTATE=0
case "${1:-}" in
  "") ;;
  --rotate) ROTATE=1 ;;
  *) echo "usage: $0 [--rotate]" >&2; exit 2 ;;
esac

if [ -z "${AGENTSHIELD_ADMIN_API_KEY:-}" ]; then
  echo "AGENTSHIELD_ADMIN_API_KEY is not set. Run: set -a && source .env && set +a" >&2
  exit 2
fi
NPX=$(command -v npx || true)
if [ -z "$NPX" ]; then
  echo "npx was not found. Install Node.js (the filesystem MCP server runs through npx)." >&2
  exit 2
fi
python3 -c 'import sys; sys.exit(0 if sys.version_info >= (3, 10) else 1)' \
  || { echo "python3 3.10 or newer is required." >&2; exit 2; }

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

# write_env: the key goes straight from the response body into the env file; it is never in a shell variable.
write_env() {
  mkdir -p "$MCP_DIR"
  chmod 700 "$MCP_DIR"
  (
    umask 077
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
}

# ---------------------------------------------------------------- agent

echo "Agent '$AGENT_NAME'..."
status=$(admin POST /api/v1/agents "{\"name\":\"$AGENT_NAME\",\"description\":\"Claude through the AgentShield MCP proxy (demo)\"}")
if [ "$status" = "201" ]; then
  agent_id=$(field 'd["id"]')
  write_env
  echo "  registered (API key saved to $ENV_FILE, not shown)"
elif [ "$status" = "409" ]; then
  status=$(admin GET /api/v1/agents)
  [ "$status" = "200" ] || fail "Could not list agents" "$status"
  agent_id=$(field 'next((x["id"] for x in d if x["name"] == a[0]), "")' "$AGENT_NAME")
  [ -n "$agent_id" ] || { echo "The name is taken but the agent was not found in the list." >&2; exit 1; }
  agent_status=$(field 'next((x["status"] for x in d if x["name"] == a[0]), "")' "$AGENT_NAME")
  saved_uuid=""
  if [ -f "$ENV_FILE" ]; then
    saved_uuid=$(sed -n "s/^export AGENTSHIELD_AGENT_UUID=//p" "$ENV_FILE" | tr -d "'\"")
  fi
  if [ "$ROTATE" = "0" ] && [ "$saved_uuid" = "$agent_id" ]; then
    echo "  already registered (status $agent_status); keeping the key saved in $ENV_FILE"
  else
    echo "  already registered (status $agent_status); rotating its key"
    status=$(admin POST "/api/v1/agents/$agent_id/rotate-key")
    [ "$status" = "200" ] || fail "Key rotation failed" "$status"
    write_env
    echo "  new API key saved to $ENV_FILE (not shown). Restart any running proxy."
  fi
  if [ "$agent_status" != "ACTIVE" ]; then
    echo "  warning: the agent is $agent_status, so every call will be denied. Reactivate it in the console (Agents)." >&2
  fi
else
  fail "Agent registration failed" "$status"
fi

# ---------------------------------------------------------------- tool

echo "Tool '$TOOL_NAME'..."
status=$(admin GET /api/v1/tools)
[ "$status" = "200" ] || fail "Could not list tools" "$status"
tool_id=$(field 'next((t["id"] for t in d if t["name"] == a[0]), "")' "$TOOL_NAME")
if [ -z "$tool_id" ]; then
  status=$(admin POST /api/v1/tools "{\"name\":\"$TOOL_NAME\",\"toolType\":\"FILESYSTEM\"}")
  [ "$status" = "201" ] || fail "Could not register tool $TOOL_NAME" "$status"
  tool_id=$(field 'd["id"]')
  echo "  registered"
else
  tool_status=$(field 'next((t["status"] for t in d if t["name"] == a[0]), "")' "$TOOL_NAME")
  echo "  already registered (status $tool_status), reusing it"
  [ "$tool_status" = "ACTIVE" ] || echo "  warning: the tool is $tool_status, so every call will be denied." >&2
fi

# ---------------------------------------------------------------- grant: exactly READ and WRITE

echo "Grant..."
status=$(admin GET "/api/v1/permissions/agent/$agent_id")
[ "$status" = "200" ] || fail "Could not list grants" "$status"
existing=$(python3 - "$BODY" "$tool_id" <<'PY'
import json, sys
with open(sys.argv[1]) as f:
    d = json.load(f)
for p in d:
    if p["toolId"] == sys.argv[2]:
        print(p["id"], sorted(p["allowedActions"]) == ["READ", "WRITE"])
        break
PY
)
if [ "${existing#* }" = "True" ]; then
  echo "  $TOOL_NAME: [READ, WRITE] already granted"
else
  if [ -n "$existing" ]; then
    status=$(admin DELETE "/api/v1/permissions/${existing%% *}")
    [ "$status" = "204" ] || fail "Could not replace the $TOOL_NAME grant" "$status"
  fi
  status=$(admin POST /api/v1/permissions "{\"agentId\":\"$agent_id\",\"toolId\":\"$tool_id\",\"allowedActions\":[\"READ\",\"WRITE\"]}")
  [ "$status" = "201" ] || fail "Could not grant $TOOL_NAME" "$status"
  echo "  $TOOL_NAME: [READ, WRITE] granted"
fi

# ---------------------------------------------------------------- venv

echo "Python environment ($VENV)..."
[ -d "$VENV" ] || python3 -m venv "$VENV"
"$VENV/bin/python" -m pip install -q --disable-pip-version-check -e "$REPO/sdk/python" -e "$REPO/mcp-proxy"
echo "  agentshield-mcp-proxy installed"

# ---------------------------------------------------------------- wrapper

# GUI apps such as Claude Desktop start with a minimal PATH, so the wrapper adds the directory that holds npx/node.
mkdir -p "$MCP_DIR"
cat > "$WRAPPER" <<EOF
#!/usr/bin/env bash
# Starts the AgentShield MCP proxy with the agent credentials from $ENV_FILE (generated by scripts/setup-mcp-demo.sh).
set -euo pipefail
. "$ENV_FILE"
export PATH="$(dirname "$NPX"):\$PATH"
exec "$VENV/bin/agentshield-mcp-proxy" --config "$CONFIG" "\$@"
EOF
chmod 700 "$WRAPPER"

cat <<EOF

Done. The proxy exposes $REPO/demo-workspace (every value there is fake).

Claude Code (user scope, stdio; the key stays in $ENV_FILE):

  claude mcp add --scope user --transport stdio $SERVER_NAME -- $WRAPPER

Claude Desktop: add this to ~/Library/Application Support/Claude/claude_desktop_config.json, then restart it:

  {
    "mcpServers": {
      "$SERVER_NAME": {
        "command": "$WRAPPER"
      }
    }
  }

Then follow the demo script in docs/mcp-proxy.md. Approve held calls in the console (Reviews).
EOF
