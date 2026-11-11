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

### Step 0. Public landing page (http://localhost:3000/welcome)
- No admin key needed. Scroll through the three sections: the intro prompt box (real requests and verdicts),
  **The pipeline** (the five gates in order) and **Scenarios** (the simulator runs and their documented outcomes).
  The robot's face shows the same verdict as the selected scenario. Everything works offline.
- With reduced motion turned on, the camera, typing and auto-advance stop and every request is listed.
- Click **Open console**. The unlock panel links back here ("New here? See how AgentShield works").

### Step 1. Unlock the console
- Paste the admin key into **Unlock the console**.
- Point out that the key stays only in the browser session. The server stores only an HMAC-SHA256 hash with a pepper.
- Optional: show the theme switcher (light/dark).

### Step 2. Overview (Checkpoint)
- Top: the latest requests as a funnel through the gates (Identity, Permission, Policy, Risk engine,
  Trajectory, Allowed), and **Where each request stopped**: one dot per request at the gate that decided it.
- Then **Open reviews** (pending and in-review requests, newest first) and **Most escalated session**.
- Bottom: **Live security alerts** and the decision breakdown.
- The bell in the header shows unread alerts and jumps straight to the alert feed.
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
DENY and REVIEW decisions from Steps 6-8 appear as live security alerts: toasts, the bell count in the header,
and the alert feed on Overview. Click the bell to jump to the feed, then **Mark all read**.

### Step 10. Activity (audit log)
- Filter by decision = DENY. Open the `.env` event: reason, risk score, session ID, agent.
- Open the trajectory REVIEW event: trajectory evidence (each factor, its points and its reason).
- Explain: every decision is audited, including denials. This gives explainability.

### Step 11. Reviews (human in the loop)
- The page has four tabs, each with a count: **Needs action** (pending or in review, not expired),
  **Approved**, **Rejected** and **Expired**.
- In **Needs action**, open a review, click **Start review**, then **Approve** or **Reject**. Each opens a
  confirmation; reject needs a note.
- Show the trajectory review from Step 7 with its evidence and the signal that escalated it.

### Step 11b. Close the loop live: the agent waits for your decision (B3)
Use two windows side by side: the terminal (Tab 5) and the browser on **CI/CD demo** (select
`faculty-demo-agent`), with **Reviews** in a second tab.

```bash
cd simulator
python3 simulator.py --scenario review_required --wait-for-review --review-timeout 300
```
1. Step 1 (`jenkins EXECUTE`) gets **REVIEW**. The terminal prints `... review <id> (...): PENDING` and keeps
   polling every 3 seconds.
2. On **CI/CD demo**, the new run appears at the top and is selected. Step 1 shows **Waiting for review** and the
   page refreshes every 4 seconds. Click **Open review** on that step (it opens in **Reviews**, Needs action tab).
   Click **Start review**. The terminal prints `IN_REVIEW`.
3. Click **Approve**, type your name (it is remembered for the tab) and an optional note, then confirm. The
   terminal prints `APPROVED by <name>`, claims the approval once, checks it is exactly `jenkins EXECUTE
   jenkins/job/agentshield-build`, runs the mock and moves on. Back on **CI/CD demo**, step 1 changes to
   **Approved, executed** with your name, and its connector fills.
4. Step 2 (`shell EXECUTE`) gets **REVIEW** too. This time click **Start review**, then **Reject**, with a
   note such as "Healthchecks run from the scheduler, not the agent". The terminal shows **BLOCKED**, with
   your name and note. The CI/CD page shows step 2 **Rejected** with your note, and the run as **Rejected**.

What to say:
> An approval is not a permission grant. It is a one-time token for one exact operation: the agent can claim it
> once, before it expires (30 minutes), and only the agent that made the request can see it. A second claim, an
> expired review, or a different tool/action/resource is refused, and the simulator fails closed.

Optional evidence: in the review detail, **Claimed by the agent** now shows a time. The same review cannot be
claimed again (HTTP 409).

### Step 12. CI/CD demo page (live pipeline runs)
- Select `faculty-demo-agent`. Left: every simulator run of this agent, newest first, with its status (Succeeded,
  Waiting for review, Blocked, Rejected, Expired, Running) and one icon per step. Right: the selected run's steps as
  cards: tool and action, resource, status, the gate that blocked it, and the reviewer and note once decided.
- Each card links to its request in **Activity** and, for a review, to **Reviews**. This page never approves or
  rejects anything itself.
- **Copy run command** copies the exact command for the selected scenario, for example
  `python3 simulator.py --scenario review_required --wait-for-review`. **What this scenario does** (collapsed)
  shows the scenario's description and documented expectation.
- Runs are rebuilt from the audit log (the agent's latest 100 requests) and the review requests; nothing is stored
  by the page.

### Step 12b. Real CI/CD with Jenkins (E2)

This step runs real commands: a real Jenkins build of the risk-engine image, a push to a local registry and a staging deploy. Each command runs only after AgentShield allows it and its one-time decision is redeemed. The one-time setup is in [`ci/jenkins/README.md`](../ci/jenkins/README.md):

- `scripts/setup-ci-agent.sh`
- the Jenkins credential `agentshield-ci-agent-key`
- `ci/jenkins/setup-local-infra.sh`
- the job `agentshield-guarded-deploy`

Do this setup before the faculty arrive.

1. **Jenkins** (http://localhost:8080): click **agentshield-guarded-deploy**, then **Build with Parameters** (leave ATTACK off), then **Build**.
2. **Console → CI/CD**: pick **Jenkins · jenkins-ci-agent**. The build appears under **Real pipeline runs** as `Jenkins · agentshield-guarded-deploy #<n>`. Build and test shows two **Allowed** steps.
3. The **Push** step shows **Waiting for review**, and the Jenkins console says it is waiting for an operator. The build is really paused. Open the review from the step card, read it, and **Approve**.
4. Within a few seconds, Jenkins claims the approval, redeems it and pushes. Then Deploy staging and Smoke test run. The run shows **Authorized**, and `curl -s localhost:8100/health` answers from the freshly deployed container.
5. **The attack:** build again with **ATTACK** ticked. The stage *Attack: read secrets* asks to read `$WORKSPACE/.env`.
   - The build fails with **Blocked by AgentShield (denied or rejected)**, and nothing is pushed.
   - The console shows the step **Blocked** at the **Policy** gate.
   - The agent holds `filesystem READ`, so the denial comes from policy, not from a missing grant.
6. Optional: reject the push instead of approving it. The stage fails with the same Blocked message, and nothing is deployed.

Say plainly what this shows: every command inside the guarded stages was authorized and recorded, and each authorization worked once. It does not stop someone from running `docker` on this Mac without the guard.

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
(cd frontend && npx vitest run)                                      # 642 tests
```
The backend prints some `ERROR` lines on purpose. Those tests simulate a database or evaluator failure to prove the
gateway fails safely. The run passes if Maven exits without `BUILD FAILURE`.

Also show the `.github/workflows/` folder: CI runs backend, risk engine and security scans on every push.

---

## Part 6 — Be honest about limits (faculty respect this)

- **Cooperative enforcement:** the agent must call AgentShield. An agent that calls Docker directly bypasses it.
  In the Jenkins pipeline the guard makes each guarded command depend on a signed, one-time decision, but commands
  run without the guard (or outside Jenkins) are not stopped; protecting the Jenkinsfile is what keeps stages guarded.
- Rules and trajectory are **deterministic heuristics**, not a trained ML model.
- Not built yet: prompt-injection detection, rate limiting, multi-tenancy, per-operator admin accounts.
- The reviewer name is typed by the operator, not an authenticated identity (everyone shares one admin key), and
  agents learn about decisions by polling, not by notification.
- Review decisions and claims are stored on the review request, but they are not written to an audit log.

---

## After the demo
```bash
# Ctrl+C in Tabs 2, 3, 4, then:
docker stop agentshield-postgres
```
Never run `docker compose down -v`. It deletes the database.
