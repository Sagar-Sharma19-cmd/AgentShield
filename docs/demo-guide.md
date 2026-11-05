# AgentShield — Faculty Demo Guide

Run everything from `~/Developer/AgentShield`, the most complete version
(trajectory analysis, Tools, CI/CD demo page, theming).

Ports: frontend **3000**, backend **8081** (Jenkins already uses 8080), risk engine **8000**, Postgres **5434**.

---

## Part 0 — Before the faculty arrive (about 10 minutes)

Open Docker Desktop, then open 5 terminal tabs.

**Tab 1: Database**
```bash
docker start agentshield-postgres
docker ps | grep agentshield-postgres        # should say (healthy)
```

**Tab 2: Risk Engine**
```bash
cd ~/Developer/AgentShield/risk-engine
uvicorn main:app --host 127.0.0.1 --port 8000
```

**Tab 3: Backend**
```bash
cd ~/Developer/AgentShield/backend
set -a && source ~/Developer/AgentShield/.env && set +a
mvn clean package -DskipTests
java -jar target/*-SNAPSHOT.jar        # listens on 8081 by default
```
Wait for `Started AgentShieldApplication`.

**Tab 4: Frontend**
```bash
cd ~/Developer/AgentShield/frontend
npm run build
npm start
```

**Tab 5: Demo terminal** (the one you present from)
```bash
cd ~/Developer/AgentShield
set -a && source ~/Developer/AgentShield/.env && set +a
grep AGENTSHIELD_ADMIN_API_KEY ~/Developer/AgentShield/.env   # copy this for the UI
```

If a service is already running from earlier, its port is busy. Stop the old one first, or keep using it.

---

## Part 1 — Introduce the problem (1 minute, no commands)

> AI agents call tools: GitHub, Docker, Kubernetes, the file system. If an agent is tricked or buggy, it can
> leak secrets or delete production. AgentShield is a gateway: before every tool call, the agent asks
> AgentShield. It answers **ALLOW**, **REVIEW** (a human must approve) or **DENY**, explains why, and
> records everything.

Pipeline: **Authentication → PermissionEngine → PolicyEngine → Risk Engine → Trajectory analysis → Audit**

---

## Part 2 — The console (browser: http://localhost:3000)

### Step 1. Unlock the console
- Paste the admin key into **Unlock the console**.
- Point out that the key stays only in the browser session. The server stores only an HMAC-SHA256 hash with a pepper.
- Optional: show the theme switcher (light/dark).

### Step 2. Overview
- Stats, decision breakdown (ALLOW / REVIEW / DENY), risk distribution, recent events.
- Security state is shown with text and icons, not only color (accessibility).

### Step 3. Tools
- Click **Register a tool**. Name: `slack-notifier`. Pick a type. Save.
- Show it appears as ACTIVE. Explain: an agent can only call tools in this registry.

### Step 4. Agents: register an agent live
- Click **Register an agent**. Name: `ui-demo-agent`.
- A dialog shows the API key **once**. Explain: it is never stored in plain text, so it can't be shown again.
- Open the agent and **Grant** it `github` with `READ` only. Explain least privilege.

---

## Part 3 — Live attacks and decisions (Tab 5)

### Step 5. Set up the CI/CD demo agent
```bash
scripts/demo.sh setup faculty-demo-agent
source ~/.agentshield-demo/env
```
This registers an agent, reuses or creates 6 mock tools, and grants least-privilege permissions. The key goes to a
0600 file and is never printed. Refresh **Agents** in the browser to show the new agent.

If the name is taken: `scripts/demo.sh setup faculty-demo-agent-2`.

### Step 6. Run the CI/CD simulator (5 scenarios)
```bash
cd simulator
python3 simulator.py --list
python3 simulator.py --scenario basic_read_write
python3 simulator.py --scenario credential_access
python3 simulator.py --scenario review_required
python3 simulator.py --scenario deployment_pipeline
python3 simulator.py --scenario scope_escalation
cd ..
```

| Scenario | What to say | Result (verified live) |
|---|---|---|
| `basic_read_write` | Normal build: read repo, build image | ALLOW, both steps run (2/2) |
| `credential_access` | Agent tries to read `.env` | **DENY**: secrets are blocked even though READ is granted |
| `review_required` | Agent wants to run a Jenkins job | **REVIEW**: pipeline pauses for a human |
| `deployment_pipeline` | Push image to an external registry | Steps 1-2 run, step 3 (EXTERNAL_REQUEST) goes to **REVIEW** |
| `scope_escalation` | Delete a canary resource | WRITE allowed, DELETE goes to **REVIEW** |

Key point: tools are **mocks**. Nothing real runs, and a tool runs only when the decision is ALLOW.

### Step 7. Trajectory analysis (the research contribution)
```bash
scripts/demo.sh trajectory
```
Six requests in one session. Three secret reads are DENIED. The final `kubernetes WRITE` is harmless
**on its own** (ALLOW, risk 20), but the **session history** (3 denials, 4 different tools, 6 requests in
60 seconds) gives HIGH trajectory risk, so it is **escalated to REVIEW**.

> Single-request rules miss multi-step attacks. Trajectory analysis looks at behaviour over time. It can only
> escalate ALLOW to REVIEW. It never blocks on its own, because heuristics can be wrong.

### Step 8. Security checks
```bash
scripts/demo.sh attacks
```
| Attack | Expected |
|---|---|
| Forged agent key on the gateway | HTTP 401 |
| Admin API with no key | HTTP 401 |
| Agent key used on the admin API (privilege escalation) | HTTP 401 |
| Tool the agent was never granted (`shell DELETE`) | DENY, risk 100, "not permitted" |

---

## Part 4 — Back in the browser

### Step 9. Alerts
DENY and REVIEW decisions from Steps 6-8 appear as live security alerts (toasts plus the alert feed on Overview).

### Step 10. Activity (audit log)
- Filter by decision = DENY. Open the `.env` event: reason, risk score, session ID, agent.
- Open the trajectory REVIEW event: trajectory evidence (each factor, its points and its reason).
- Explain: every decision is audited, including denials. This gives explainability.

### Step 11. Reviews (human in the loop)
- Open a pending review, then click **Start review**, then **Approve** or **Reject**.
- Show the trajectory review from Step 7 with its evidence.

### Step 12. CI/CD demo page
- Select `faculty-demo-agent`. It shows the scenario steps and the decisions recorded in the audit log.

### Step 13. Agent lifecycle (kill switch)
1. **Agents**, then `faculty-demo-agent`, then **Suspend agent**.
2. Terminal: `cd simulator && python3 simulator.py --scenario basic_read_write`. It is now blocked.
3. **Reactivate agent**, then run it again. It works.
4. **Rotate key**, then run it again. The old key is rejected, so the simulator **fails closed**.

---

## Part 5 — Quality evidence (Tab 5)

```bash
cd ~/Developer/AgentShield
(cd backend && mvn -q test)                                          # 320 tests, 4 skipped
(cd risk-engine && pytest -q)                                        # 43 tests
(cd simulator && python3 -m unittest discover -s tests -t .)         # 43 tests
(cd frontend && npx vitest run)                                      # 322 tests
```
The backend prints some `ERROR` lines on purpose. Those tests simulate a database or evaluator failure to prove the
gateway fails safely. The run passes if Maven exits without `BUILD FAILURE`.

Also show the `.github/workflows/` folder: CI runs backend, risk engine and security scans on every push.

---

## Part 6 — Be honest about limits (faculty respect this)

- **Cooperative enforcement:** the agent must call AgentShield. An agent that calls Docker directly bypasses it.
- Rules and trajectory are **deterministic heuristics**, not a trained ML model.
- Not built yet: prompt-injection detection, rate limiting, multi-tenancy, per-operator admin accounts.

---

## After the demo
```bash
# Ctrl+C in Tabs 2, 3, 4, then:
docker stop agentshield-postgres
```
Never run `docker compose down -v`. It deletes the database.
