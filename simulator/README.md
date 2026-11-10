# AgentShield CI/CD Runtime Security Simulator (M4.1)

A Python simulator that behaves like an AI DevOps agent inside a CI/CD pipeline. Every mock tool
operation is sent to the AgentShield gateway first. A mock tool runs **only** when the gateway
decision is `ALLOW`.

**Enforcement model: cooperative tool adapter.** The agent (here, this simulator) must call
AgentShield before acting. AgentShield does not intercept network traffic, and it cannot stop an
agent that calls Docker, Kubernetes or Jenkins directly. See [Limitations](#limitations).

Standard library only (`urllib`). No new dependencies. No real infrastructure is contacted.

---

## What it does

- Reads configuration from environment variables only. Nothing is hardcoded and no key is printed.
- Sends `POST /api/v1/gateway/evaluate` with the exact contract from
  `backend/.../dto/EvaluationRequest.java`: `agentId`, `sessionId`, `action`, `resource`, `tool`.
- Creates a traceable session ID for each run, for example `ci-deploy-staging-76bb2dbe2dd2`.
  Every step in the run carries it.
- Reads the **decision from the response body** (`ALLOW`, `REVIEW` or `DENY`). HTTP 200 alone is never
  treated as permission.
- Validates the response before trusting it. The decision must be one of the three values. The
  echoed `action` and `resource` must match what was sent. `ALLOW` must come with
  `authorizationResult = AUTHORIZED`. Otherwise the step fails closed.
- Fails closed on connection errors, timeouts, non-2xx HTTP status, non-JSON bodies, and
  contradictory bodies. No mock tool runs in any of these cases.
- Does not retry after `REVIEW`. The backend has no agent-facing review status endpoint, so the
  simulator reports the `reviewRequestId` and stops.

## Files

| File | Purpose |
|------|---------|
| `simulator.py` | CLI entry point, output formatting, exit codes |
| `agentshield_client.py` | HTTP client, configuration loading, strict response validation |
| `enforcement.py` | The gate. The only code path that can call a mock executor |
| `mock_tools.py` | Harmless mock GitHub, Jenkins, Docker, Kubernetes, Shell and filesystem tools |
| `scenarios.py` | Demo pipelines (operations, tools, resources) |
| `tests/` | Unit and local-socket tests (no backend required) |

## Mock tools

None of these contacts a network service, runs a shell command, touches a Docker daemon, or
modifies a cluster. Each appends one line to `execution.log` in a temporary directory
(`agentshield-sim-*`), and prints a `MOCK` description.

| Tool | Operation | Action |
|------|-----------|--------|
| `github` | read repository build information | READ |
| `jenkins` | trigger a simulated build | EXECUTE |
| `docker` | build a simulated image | WRITE |
| `docker` | push to a simulated external registry | EXTERNAL_REQUEST |
| `kubernetes` | apply a simulated manifest | WRITE |
| `kubernetes` | delete a simulated resource | DELETE |
| `shell` | simulated healthcheck (no process) | EXECUTE |
| `filesystem` | simulated file read (nothing is opened) | READ |

## Scenarios

Run `python3 simulator.py --list` to see them. The table lists the rule in
`backend/.../policy/PolicyEngine.java` that applies to each step. These are what the source code
says. **Verify them against a live run**, because registered grants and the Risk Engine can change a
final decision.

| Scenario | Steps | Rule that applies (PolicyEngine) |
|----------|-------|----------------------------------|
| `basic_read_write` | github READ; docker WRITE | READ and WRITE are ALLOW unless a secret, production or admin pattern matches |
| `credential_access` | filesystem READ `.env` | Secret/credential resource is DENY, even though the grant allows READ |
| `review_required` | jenkins EXECUTE; shell EXECUTE | Generic EXECUTE is REVIEW |
| `deployment_pipeline` | github READ; docker WRITE; docker EXTERNAL_REQUEST; kubernetes WRITE | EXTERNAL_REQUEST is REVIEW. The pipeline halts there by default |
| `scope_escalation` | kubernetes WRITE; kubernetes DELETE (canary) | Non-production DELETE is REVIEW |

Authorization runs before policy. A step with no grant gets DENY from the PermissionEngine, and the
policy is not evaluated.

Risk Engine check: for the ALLOW steps above, the Risk Engine on `127.0.0.1:8000` returned LOW
(scores 5 and 10) when queried directly with the same inputs. A HIGH tier would have turned an ALLOW
into REVIEW. A live run is still the authority.

---

## Setup: register a local fake agent

These commands **create records in the backend database**. Run them only against a local development
database. Replace `AGENTSHIELD_BACKEND` with your backend URL. This project's local backend listens
on **8081**; do not assume 8080.

```bash
export AGENTSHIELD_BACKEND=http://localhost:8081          # your Spring Boot backend
# AGENTSHIELD_ADMIN_API_KEY must already be exported (from your local .env). It is never printed here.

mkdir -p ~/.agentshield-sim && chmod 700 ~/.agentshield-sim

# 1. Register the agent. The response contains apiKey ONCE. Store it in a 0600 file, do not echo it.
curl -s -X POST "$AGENTSHIELD_BACKEND/api/v1/agents" \
  -H "X-Admin-API-Key: $AGENTSHIELD_ADMIN_API_KEY" -H 'Content-Type: application/json' \
  -d '{"name":"ci-devops-agent","description":"Simulated CI/CD agent (M4.1 demo)"}' \
  > ~/.agentshield-sim/agent.json
chmod 600 ~/.agentshield-sim/agent.json

# 2. Load the key and the agent UUID into the environment without printing them.
export AGENTSHIELD_AGENT_API_KEY="$(python3 -c 'import json,os; print(json.load(open(os.path.expanduser("~/.agentshield-sim/agent.json")))["apiKey"])')"
AGENT_ID="$(python3 -c 'import json,os; print(json.load(open(os.path.expanduser("~/.agentshield-sim/agent.json")))["id"])')"

# 3. Register the six simulated tools. Each call prints the tool's id.
register_tool() {
  curl -s -X POST "$AGENTSHIELD_BACKEND/api/v1/tools" \
    -H "X-Admin-API-Key: $AGENTSHIELD_ADMIN_API_KEY" -H 'Content-Type: application/json' \
    -d "{\"name\":\"$1\",\"toolType\":\"$2\"}" \
  | python3 -c 'import json,sys; print(json.load(sys.stdin)["id"])'
}
GITHUB_ID=$(register_tool github SOURCE_CONTROL)
FS_ID=$(register_tool filesystem FILESYSTEM)
JENKINS_ID=$(register_tool jenkins OTHER)
DOCKER_ID=$(register_tool docker OTHER)
K8S_ID=$(register_tool kubernetes OTHER)
SHELL_ID=$(register_tool shell SHELL)

# 4. Grant only what each scenario needs (least privilege).
grant() {
  curl -s -o /dev/null -w "grant %{http_code}\n" -X POST "$AGENTSHIELD_BACKEND/api/v1/permissions" \
    -H "X-Admin-API-Key: $AGENTSHIELD_ADMIN_API_KEY" -H 'Content-Type: application/json' \
    -d "{\"agentId\":\"$AGENT_ID\",\"toolId\":\"$1\",\"allowedActions\":[$2]}"
}
grant "$GITHUB_ID"  '"READ"'
grant "$FS_ID"      '"READ"'
grant "$JENKINS_ID" '"EXECUTE"'
grant "$SHELL_ID"   '"EXECUTE"'
grant "$DOCKER_ID"  '"WRITE","EXTERNAL_REQUEST"'
grant "$K8S_ID"     '"WRITE","DELETE"'

export AGENTSHIELD_GATEWAY_URL="$AGENTSHIELD_BACKEND"
export AGENTSHIELD_AGENT_ID=ci-devops-agent
```

Cleanup (the agent API has no delete endpoint): revoke the agent with
`PATCH $AGENTSHIELD_BACKEND/api/v1/agents/$AGENT_ID/status` and body `{"status":"REVOKED"}`, then
delete `~/.agentshield-sim/`.

## Run

Configuration is required from the environment. There is no default gateway URL.

| Variable | Meaning |
|----------|---------|
| `AGENTSHIELD_GATEWAY_URL` | Gateway base URL, for example `http://localhost:8081` |
| `AGENTSHIELD_AGENT_ID` | Registered agent name or UUID |
| `AGENTSHIELD_AGENT_API_KEY` | The agent's API key |

```bash
cd simulator
python3 simulator.py --list
python3 simulator.py --scenario basic_read_write
python3 simulator.py --scenario credential_access
python3 simulator.py --scenario review_required
python3 simulator.py --scenario deployment_pipeline                  # halts at the registry push
python3 simulator.py --scenario deployment_pipeline --continue-on-block   # evaluate every step
```

Exit codes: `0` every step was allowed and executed; `1` the pipeline halted or some steps did not
execute; `2` configuration error.

### Waiting for a human decision: `--wait-for-review`

```bash
python3 simulator.py --scenario review_required --wait-for-review                    # wait up to 300 s per review
python3 simulator.py --scenario review_required --wait-for-review --review-timeout 120
```

Without the flag, a REVIEW stops the step exactly as before. With it, on REVIEW the simulator:

1. Polls `GET /api/v1/gateway/reviews/{reviewRequestId}` every 3 seconds with its own agent key, and
   prints each status change (`PENDING`, `IN_REVIEW`, `APPROVED`/`REJECTED`, with the reviewer and note).
2. **APPROVED:** calls `POST /api/v1/gateway/reviews/{id}/claim` once. It checks that the claimed `tool`,
   `action` and `resource` equal the operation it asked for, and only then runs the mock and continues
   the pipeline. A mismatch fails closed. The claim was spent, but nothing runs.
3. **REJECTED:** the step is `BLOCKED`, showing who rejected it and their note.
4. **Expired, timed out (`--review-timeout`, default 300 s), already claimed, 404/409/5xx, unreachable or
   malformed:** the step is `FAILED_CLOSED` and nothing runs.

The approval is a one-time token for that exact operation. A second claim is refused (409), and an
approval never covers a different tool, action or resource. Reviews expire 30 minutes after the gateway
created them (backend setting `AGENTSHIELD_REVIEW_TTL_MINUTES`).

## Tests

```bash
cd simulator
python3 -W error::ResourceWarning -m unittest discover -s tests -t .
```

The suite covers:
- ALLOW executes the mock tool once.
- REVIEW never executes the mock tool, and shows the review ID.
- DENY never executes the mock tool, even over a real HTTP 200.
- Gateway unavailable, connection reset, timeouts (direct and wrapped), HTTP 401 and HTTP 500 never
  execute.
- Malformed responses never execute: non-JSON, JSON array, missing or unknown decision, lowercase
  decision, echoed action or resource mismatch, ALLOW without AUTHORIZED, missing requestId, boolean
  riskScore, empty body.
- A pipeline halts at the first REVIEW, and later steps are not sent to the gateway.
- The request body matches the contract, and the key is sent only in `X-Agent-API-Key`.
- `--wait-for-review` (`tests/test_review_wait.py`, against a scripted local stub, with fake time so no test
  waits): approve then claim once and execute; reject gives BLOCKED with the reviewer and note; timeout,
  expiry, an already-consumed approval, claim 409, read errors and malformed review bodies fail closed; a
  claimed tool/action/resource that differs from the operation fails closed; status changes are reported
  once each; review ids that are not UUIDs are refused before any request; without the flag, nothing is polled.
- The API key never appears in configuration output, error messages, or the step output.
- Real local-socket tests against an in-process stub on `127.0.0.1` cover the real `urllib`
  status-code and timeout paths. This stub is not the AgentShield backend.

Result at the time of writing: **58 tests, all passing**, with `ResourceWarning` treated as an error.

## Limitations

- **Cooperative enforcement only.** AgentShield decides, and the simulator complies. A real agent
  that calls Docker, Jenkins or Kubernetes directly bypasses AgentShield. Real enforcement needs the
  tool or network path to require an ALLOW, which is not built.
- **Mock tools only.** Nothing is executed, so no real side effect is tested.
- **Review completion is opt-in and polled.** Without `--wait-for-review`, a REVIEW stops the run. With
  it, the simulator polls every 3 s; there are no push notifications. The approval covers one exact
  operation once; AgentShield does not observe the mock (or a real tool) actually running afterwards.
- **Metadata not sent.** `EvaluationRequest.metadata` is accepted by the backend but never stored or
  used. Traceability is the session ID, which is stored in `audit_logs.session_id`.
- **Session identity is client-supplied.** The session ID is chosen by the client, so it proves a
  run, not who started it.
- **Live demo not run.** The demo commands above were not run against the live backend in this
  milestone. The tests and the stub-gateway run cover the simulator's behaviour. The decisions for
  a live backend are derived from source and must be confirmed.
- **Temporary logs are kept.** Each run leaves its `agentshield-sim-*` directory in the system
  temporary directory for inspection.
