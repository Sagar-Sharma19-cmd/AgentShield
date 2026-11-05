#!/usr/bin/env bash
# AgentShield live-demo helper. Local development use only.
#
#   scripts/demo.sh setup [agent-name]  register agent + mock tools + least-privilege grants
#   scripts/demo.sh trajectory          one session whose history escalates an ALLOW to REVIEW
#   scripts/demo.sh attacks             authentication checks (bad agent key, missing admin key)
#
# Needs AGENTSHIELD_ADMIN_API_KEY in the environment (source the repo .env first).
# The agent API key is written to ~/.agentshield-demo/env (mode 0600) and never printed.
set -euo pipefail

BACKEND="${AGENTSHIELD_BACKEND:-http://localhost:8081}"
DEMO_DIR="$HOME/.agentshield-demo"
ENV_FILE="$DEMO_DIR/env"

need_admin() {
  if [ -z "${AGENTSHIELD_ADMIN_API_KEY:-}" ]; then
    echo "AGENTSHIELD_ADMIN_API_KEY is not set. Run: set -a && source ~/Developer/AgentShield/.env && set +a" >&2
    exit 2
  fi
}

admin() { # method path [json] [extra curl args...]
  local method=$1 path=$2 body=${3:-}
  shift $(( $# < 3 ? $# : 3 ))
  curl -s -X "$method" "$BACKEND$path" -H "X-Admin-API-Key: $AGENTSHIELD_ADMIN_API_KEY" \
    -H 'Content-Type: application/json' ${body:+-d "$body"} "$@"
}

json() { python3 -c "import json,sys; d=json.load(sys.stdin); print($1)"; }

tool_id() { # name type -> id (reuses an existing tool with that name)
  local id
  id=$(admin GET /api/v1/tools | python3 -c "
import json,sys
d=json.load(sys.stdin); d=d.get('content',d) if isinstance(d,dict) else d
print(next((t['id'] for t in d if t['name']=='$1'),''))")
  if [ -z "$id" ]; then
    id=$(admin POST /api/v1/tools "{\"name\":\"$1\",\"toolType\":\"$2\"}" | json "d['id']")
    echo "  registered tool $1" >&2
  else
    echo "  tool $1 already registered, reusing it" >&2
  fi
  echo "$id"
}

cmd_setup() {
  need_admin
  local name="${1:-faculty-demo-agent}"
  mkdir -p "$DEMO_DIR" && chmod 700 "$DEMO_DIR"

  echo "Registering agent '$name'..."
  local resp
  resp=$(admin POST /api/v1/agents "{\"name\":\"$name\",\"description\":\"Live demo CI/CD agent\"}")
  if ! echo "$resp" | python3 -c 'import json,sys; sys.exit(0 if "apiKey" in json.load(sys.stdin) else 1)' 2>/dev/null; then
    echo "Agent registration failed (name taken?). Try: scripts/demo.sh setup ${name}-2" >&2
    echo "$resp" | python3 -c 'import json,sys; d=json.load(sys.stdin); print("  backend said:", d.get("message", d))' >&2 || true
    exit 1
  fi
  local agent_id key
  agent_id=$(echo "$resp" | json "d['id']")
  key=$(echo "$resp" | json "d['apiKey']")
  umask 077
  cat > "$ENV_FILE" <<EOF
export AGENTSHIELD_GATEWAY_URL=$BACKEND
export AGENTSHIELD_AGENT_ID=$name
export AGENTSHIELD_AGENT_UUID=$agent_id
export AGENTSHIELD_AGENT_API_KEY=$key
EOF
  echo "  agent id: $agent_id (API key saved to $ENV_FILE, not shown)"

  echo "Registering mock tools..."
  local gh fs jk dk k8 sh
  gh=$(tool_id github SOURCE_CONTROL); fs=$(tool_id filesystem FILESYSTEM)
  jk=$(tool_id jenkins OTHER);        dk=$(tool_id docker OTHER)
  k8=$(tool_id kubernetes OTHER);     sh=$(tool_id shell SHELL)

  echo "Granting least-privilege permissions..."
  grant() {
    local code
    code=$(admin POST /api/v1/permissions "{\"agentId\":\"$agent_id\",\"toolId\":\"$1\",\"allowedActions\":[$3]}" \
      -o /dev/null -w '%{http_code}')
    echo "  $2: $3 -> HTTP $code"
  }
  grant "$gh" github     '"READ"'
  grant "$fs" filesystem '"READ"'
  grant "$jk" jenkins    '"EXECUTE"'
  grant "$sh" shell      '"EXECUTE"'
  grant "$dk" docker     '"WRITE","EXTERNAL_REQUEST"'
  grant "$k8" kubernetes '"WRITE","DELETE"'

  echo
  echo "Done. In every terminal that runs the simulator:  source $ENV_FILE"
}

load_agent() {
  [ -f "$ENV_FILE" ] || { echo "Run 'scripts/demo.sh setup' first." >&2; exit 2; }
  # shellcheck disable=SC1090
  source "$ENV_FILE"
}

evaluate() { # session action tool resource
  curl -s -X POST "$BACKEND/api/v1/gateway/evaluate" \
    -H "X-Agent-API-Key: $AGENTSHIELD_AGENT_API_KEY" -H 'Content-Type: application/json' \
    -d "{\"agentId\":\"$AGENTSHIELD_AGENT_ID\",\"sessionId\":\"$1\",\"action\":\"$2\",\"tool\":\"$3\",\"resource\":\"$4\"}" \
  | python3 -c "
import json,sys
d=json.load(sys.stdin)
print(f\"  {'$2':<17}{'$3':<11}{'$4':<34}{d.get('decision','?'):<8} risk={d.get('effectiveRiskScore',d.get('riskScore','?')):<4} {d.get('reason','')[:70]}\")"
}

cmd_trajectory() {
  load_agent
  local s="traj-demo-$(date +%H%M%S)"
  echo "Session $s: each request is judged alone, AND against this session's recent history."
  echo
  printf '  %-17s%-11s%-34s%s\n' ACTION TOOL RESOURCE DECISION
  evaluate "$s" READ  filesystem /app/.env
  evaluate "$s" READ  filesystem /app/config/credentials.json
  evaluate "$s" READ  filesystem /app/secrets/db_password
  evaluate "$s" READ  github     repo/agentshield/README.md
  evaluate "$s" WRITE docker     images/agentshield-api:staging
  evaluate "$s" WRITE kubernetes k8s/staging/deployment.yaml
  echo
  echo "The last WRITE is ALLOW on its own, but the session history (3 denials, 4 tools,"
  echo "6 requests in 60s) is HIGH trajectory risk, so it goes to human REVIEW instead."
  echo "Open Reviews in the UI to see the trajectory evidence."
}

cmd_attacks() {
  need_admin; load_agent
  echo "1. Gateway call with a forged agent key:"
  curl -s -o /dev/null -w "   HTTP %{http_code}\n" -X POST "$BACKEND/api/v1/gateway/evaluate" \
    -H 'X-Agent-API-Key: forged-key-123' -H 'Content-Type: application/json' \
    -d "{\"agentId\":\"$AGENTSHIELD_AGENT_ID\",\"sessionId\":\"atk\",\"action\":\"READ\",\"tool\":\"github\",\"resource\":\"repo\"}"
  echo "2. Admin API with no admin key:"
  curl -s -o /dev/null -w "   HTTP %{http_code}\n" "$BACKEND/api/v1/agents"
  echo "3. Agent key used on the admin API (privilege escalation):"
  curl -s -o /dev/null -w "   HTTP %{http_code}\n" "$BACKEND/api/v1/agents" -H "X-Agent-API-Key: $AGENTSHIELD_AGENT_API_KEY"
  echo "4. Tool the agent was never granted (shell DELETE):"
  printf '  %-17s%-11s%-34s%s\n' ACTION TOOL RESOURCE DECISION
  evaluate "atk-$(date +%s)" DELETE shell /tmp/build-cache
}

case "${1:-}" in
  setup) shift; cmd_setup "$@" ;;
  trajectory) cmd_trajectory ;;
  attacks) cmd_attacks ;;
  *) sed -n '2,9p' "$0"; exit 2 ;;
esac
