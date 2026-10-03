# AgentShield — Product Requirements & Implementation Plan

> **Document status:** Discovery / requirements artifact. No source code, database schema, dependencies, or existing authentication/PermissionEngine/PolicyEngine/AuditService behavior were changed to produce this document.
>
> **Source of truth reminder (see `CLAUDE.md`):** `docs/architecture.md` is authoritative for current implemented architecture; `README.md` "Project Status" is authoritative for high-level progress; the source code wins if anything here disagrees with it. Everything in this document that is not explicitly labeled **CURRENT** is a proposal, not a claim of existing functionality.

---

## PART 1 — CURRENT PRODUCT

### What AgentShield does today, from a user's perspective

There is no UI. The "user" today is a developer or operator who registers agents and tools via REST calls (e.g. `curl`), wires an agent's own HTTP client to call AgentShield before it touches a real tool, and reads JSON responses and raw audit rows to see what happened. Concretely, today's usable workflow is:

1. An admin registers an **agent** (`POST /agents`) and receives that agent's API key exactly once.
2. An admin registers a **tool** (`POST /tools`) representing something the agent may eventually call (filesystem, database, etc.).
3. An admin **grants a permission** (`POST /permissions`) naming exactly which actions (`READ`/`WRITE`/`DELETE`/`EXECUTE`/`EXTERNAL_REQUEST`) that agent may perform on that tool.
4. The agent, authenticating with its own API key, calls `POST /api/v1/gateway/evaluate` before performing a real tool action, and receives `ALLOW`, `REVIEW`, or `DENY` with a machine-readable reason and a risk score.
5. Every evaluated request (whether authorized or not) is written to the `audit_logs` table — there is no API to read it back yet (`GET /audit` is listed in `docs/api-design.md` as 🔲 Planned), so today the audit trail is only inspectable via direct database access.

That's the entire current product. It is a **backend-only, API-only runtime authorization gateway** with no risk scoring, no AI-specific threat detection, no dashboard, and no human review step.

### Current request flow (verified against source)

```
Client
  │  X-Agent-API-Key / X-Admin-API-Key
  ▼
Authentication            Spring Security filter chains (SecurityConfig)
  │                        — AgentApiKeyAuthenticationFilter on /api/v1/gateway/**
  │                        — AdminApiKeyAuthenticationFilter on /api/v1/agents|tools|permissions/**
  │                        — missing/invalid/revoked key → HTTP 401, request never reaches a controller,
  │                          never written to audit_logs (logged at WARN only)
  ▼
PermissionEngine          Deterministic, 8-step, first-failure-wins:
  │                        agent exists → identity claim matches caller → agent ACTIVE →
  │                        tool registered → tool ACTIVE → grant exists → grant enabled → action in grant
  │                        any failure → AuthorizationResult (e.g. UNAUTHORIZED, AGENT_SUSPENDED, …), riskScore=100
  ▼
PolicyEngine               Only reached if PermissionEngine returned AUTHORIZED.
  │                        Deterministic substring rules against resource/action strings
  │                        (secret/.env → DENY 90, prod DELETE → DENY 95, non-prod DELETE → REVIEW 60,
  │                        EXECUTE → REVIEW, EXTERNAL_REQUEST → REVIEW, READ → ALLOW 10, WRITE → ALLOW 20)
  ▼
AuditService                Writes one audit_logs row per evaluated request (claimed agentId AND the
  │                          authenticated registeredAgentId, so impersonation attempts are visible)
  ▼
PostgreSQL                  Flyway-managed schema (V1–V3), ddl-auto=validate everywhere including tests
```

### What is actually working today (verified)

- Agent identity with a real lifecycle (`ACTIVE` / `SUSPENDED` reversible / `REVOKED` terminal)
- Tool registry (`ACTIVE` / `DISABLED`, typed)
- Fine-grained agent↔tool permission grants, one grant per pair, action-list based
- A deterministic, fully-tested authorization engine (`PermissionEngine`) that fails closed
- A deterministic, fully-tested policy/risk-rule engine (`PolicyEngine`) — substring rules only
- Agent API-key authentication (HMAC-SHA256 + pepper) and a separate admin API-key, enforced by distinct stateless Spring Security filter chains
- Audit logging of every evaluated (non-401) request, including impersonation attempts
- Flyway-managed PostgreSQL schema, with H2 running the same migrations in tests
- A real backend test suite (unit + integration) and three GitHub Actions workflows (backend tests, risk-engine tests, security/secret scanning)

### What is explicitly NOT working today (do not assume otherwise)

- No risk engine integration — the Python service is a stub returning a fixed score and is never called by the Java backend
- No frontend — `frontend/` contains only a README
- No simulator — `simulator/simulator.py` only prints "not yet implemented"
- No prompt-injection, secret-detection, or any AI-specific content inspection — `PolicyEngine` only pattern-matches resource/action *strings*, it does not inspect tool-call payloads, agent reasoning, or external content
- No review queue — a `REVIEW` decision is returned and logged, but nothing consumes or tracks it
- No audit read API, no rate limiting, no per-operator admin RBAC, no resource-path-scoped permissions, no multi-tenancy

---

## PART 2 — TARGET PRODUCT

A realistic target for AgentShield: **a developer-focused runtime security gateway for AI agents that makes "what is my agent allowed to do, and what did it just try to do" answerable, auditable, and — where a deterministic rule can't resolve it — reviewable by a human**, with increasingly capable AI-specific threat detection layered on top of the already-solid identity/permission/audit foundation.

| Area | Problem it solves | Target capability |
|---|---|---|
| **1. Agent identity** | Who is making this request, really? | Already strong (keep as-is). Target adds: key expiry/rotation grace period, optional mTLS, per-agent metadata (owner, environment). |
| **2. Tool registration** | What can an agent even reach? | Already strong (keep as-is). Target adds: tool-level default risk tier, tool-specific resource patterns (e.g. a `filesystem` tool's sensitive-path list), tool health/connectivity status. |
| **3. Fine-grained permissions** | Least privilege per agent, per tool. | Already strong at (agent, tool, action) granularity. Target adds resource-path scoping (e.g. "READ only under `src/`") and time-boxed/temporary grants. |
| **4. Policy enforcement** | Deterministic, explainable "is this action within bounds." | Already working as static rules. Target makes policy **data-driven** (stored, editable, versioned) instead of hard-coded in Java, without changing the decision hierarchy. |
| **5. Risk scoring** | A single number that summarizes "how dangerous is this," usable for REVIEW routing and dashboards. | Currently a stub. Target: a real deterministic, explainable, multi-factor risk score (Part 6), later augmented by ML. |
| **6. Secret detection** | Agents must never read/exfiltrate credentials, even ones a policy author didn't anticipate by filename. | Not implemented. Target: pattern/entropy-based scanning of resource identifiers and (where available) tool-call arguments/results for secret-shaped content. |
| **7. Prompt injection detection** | Untrusted content (web pages, files, tool outputs) can hijack agent behavior. | Not implemented. Target: heuristic detection of injection-style instructions in content an agent is about to act on, feeding risk score and audit — not a silver bullet (see Part 7). |
| **8. Tool-call security** | Catch dangerous calls regardless of which named tool they go through. | Partially implemented (action/resource substring rules). Target: structured inspection of tool-call arguments (not just a resource string), command/argument allow-lists for `SHELL`/`EXECUTE`. |
| **9. Audit logging** | Forensics, compliance, debugging. | Already solid at the write path. Target adds a **read** API (`GET /audit`, filters), retention policy, and linkage to security events/reviews. |
| **10. Security event visualization** | A human needs to see what's happening without querying Postgres. | Not implemented (no frontend). Target: dashboard surfacing decisions, trends, and anomalies (Part 9). |
| **11. Review workflow** | Not every ambiguous action should be auto-denied or auto-allowed. | Not implemented. Target: a queryable review queue with human decision, feeding back into audit (Part 8). |
| **12. Attack simulation** | Prove the gateway actually blocks what it claims to, repeatably. | Not implemented. Target: a scripted agent-request generator covering the scenarios already named in `docs/threat-model.md`. |
| **13. Security analytics** | Aggregate trends: which agents/tools/resources generate risk over time. | Not implemented. Target: read-only aggregation over audit/security-event data — no new ML required to start. |
| **14. Developer experience** | Low friction to integrate a new agent safely. | Partially implemented (clean REST API, clear error reasons). Target adds: SDK/client snippets, a "dry-run"/shadow mode (log-only, no block), and OpenAPI spec. |

Scope discipline: no feature above is proposed "because it sounds impressive" — each maps to a problem already named in `docs/threat-model.md`, `docs/research-notes.md`, or a gap identified in the repository audit.

---

## PART 3 — USER PERSONAS

### Developer building an AI agent
- **Goals:** Ship an agent that can use tools, without personally re-inventing access control or getting blamed for a `rm -rf` moment.
- **Problems:** Doesn't want to hand-write policy logic; needs fast feedback on *why* a call was denied; wants to test locally before anything touches production.
- **Needs from AgentShield:** Simple registration flow, clear deny reasons, a shadow/dry-run mode, a simulator to rehearse scenarios.
- **Features used:** Agent/Tool/Permission APIs, Gateway evaluate endpoint, Simulator, (eventually) SDK.

### Security engineer
- **Goals:** Know what agents can do, catch policy violations and anomalous behavior, respond to incidents.
- **Problems:** No visibility today beyond raw DB rows; no way to see trends or investigate a specific incident without SQL.
- **Needs from AgentShield:** Security event dashboard, audit search/filter, review queue, risk analytics.
- **Features used:** Security Events page, Review Queue, Audit Logs, Risk Analytics, Policy management.

### Platform / DevOps engineer
- **Goals:** Run AgentShield reliably alongside the agents it protects; keep it patched, observable, and not a bottleneck.
- **Problems:** Needs to know failure behavior (what happens if the Risk Engine is down?), needs metrics/health, needs sane deploy story.
- **Needs from AgentShield:** Documented fail-open/fail-closed behavior per component, health/readiness endpoints, Docker Compose / CI pipelines, rate limiting.
- **Features used:** Actuator health, Docker Compose, CI workflows, (target) rate limiting and metrics.

### Administrator
- **Goals:** Manage who/what is registered; revoke compromised agents fast; control admin access itself.
- **Problems:** Currently one shared admin key — no accountability for *which* admin did what.
- **Needs from AgentShield:** Agent/Tool/Permission CRUD (already exists), key rotation/revocation (already exists), per-operator admin identity and RBAC (target).
- **Features used:** Admin APIs, (target) Settings page, (target) per-operator RBAC.

### Student / researcher
- **Goals:** Use AgentShield as a testbed to study agent security — explainable risk scoring, trajectory analysis, policy bypass detection.
- **Problems:** Needs real request/decision data, a way to generate varied (including adversarial) traffic, and decision explanations that are inspectable, not opaque.
- **Needs from AgentShield:** Simulator with labeled attack scenarios, explainable risk factors, exportable audit/event data for analysis.
- **Features used:** Simulator, Risk Engine explainability output, Audit/Security Event export, Analytics.

---

## PART 4 — CORE USER JOURNEYS

Each journey is tagged **[CURRENT]** (possible today, verified) or **[TARGET]** (requires unbuilt components named in Part 2/5).

### Journey 1 — Developer registers an agent **[CURRENT]**
User → `POST /agents {name, description}` with admin key
→ Action: admin registers a new agent
→ System processing: `AgentService` validates name uniqueness/format, creates `Agent` row with status `ACTIVE`, generates an API key, stores only its HMAC hash + prefix
→ Decision: n/a (creation, not an authorization decision)
→ Result: `201`, API key returned **once**
→ Audit event: none today (admin actions are not yet audited — see Part 11/12 gap)

### Journey 2 — Developer registers tools **[CURRENT]**
User → `POST /tools {name, description, toolType}` with admin key
→ Action: admin registers a tool
→ System processing: `ToolService` validates name uniqueness/format, creates `Tool` row, status `ACTIVE`
→ Decision: n/a
→ Result: `201`
→ Audit event: none today (same gap as Journey 1)

### Journey 3 — Developer grants permissions **[CURRENT]**
User → `POST /permissions {agentId, toolId, allowedActions, enabled}` with admin key
→ Action: admin grants agent X actions {READ, …} on tool Y
→ System processing: `PermissionService` checks agent not revoked, checks no existing grant for the pair, persists `AgentToolPermission` + one row per action
→ Decision: n/a
→ Result: `201` with the grant
→ Audit event: none today

### Journey 4 — Agent attempts a tool call **[CURRENT]**
User (agent) → `POST /api/v1/gateway/evaluate {agentId, sessionId, tool, action, resource}` with its own API key
→ Action: agent asks "may I do this?"
→ System processing: Authentication filter verifies key → `PermissionEngine.authorize(...)` → if authorized, `PolicyEngine.evaluate(...)`
→ Decision: `AUTHORIZED`/deny-reason, then `ALLOW`/`REVIEW`/`DENY`
→ Result: `EvaluationResponse` JSON with decision, reason, riskScore
→ Audit event: one `audit_logs` row, always

### Journey 5 — Agent request is allowed **[CURRENT]**
User (agent) → requests `READ` on a resource it's granted
→ Action: normal, permitted tool use
→ System processing: PermissionEngine → `AUTHORIZED`; PolicyEngine → non-sensitive READ/WRITE
→ Decision: `ALLOW`, riskScore 10/20
→ Result: agent proceeds to actually call the real tool (outside AgentShield's control today — AgentShield only advises, it does not intercept the real tool call itself)
→ Audit event: `decision=ALLOW`, `actionOutcome=ALLOWED`

### Journey 6 — Agent request is denied **[CURRENT]**
User (agent) → requests an action it was never granted, or a secret resource, or prod DELETE
→ Action: unauthorized or policy-prohibited attempt
→ System processing: either PermissionEngine stops early (`UNAUTHORIZED`, etc., riskScore forced to 100) or PolicyEngine matches a DENY rule
→ Decision: `DENY`
→ Result: agent receives `DENY` + human-readable reason; AgentShield cannot stop the agent from acting outside the gateway, but any *compliant* integration will not proceed
→ Audit event: `decision=DENY`, `actionOutcome=BLOCKED`, `authorizationResult` set

### Journey 7 — Agent request requires REVIEW **[CURRENT, but dead-ended]**
User (agent) → requests e.g. non-prod DELETE or an EXTERNAL_REQUEST
→ Action: ambiguous/sensitive-but-not-forbidden action
→ System processing: PolicyEngine matches a REVIEW rule
→ Decision: `REVIEW`, riskScore 60–75
→ Result: response says `REVIEW` — **today nothing routes this anywhere; there is no queue, so in practice an integration must decide itself what "REVIEW" means operationally**
→ Audit event: `decision=REVIEW`, `actionOutcome=REVIEW_REQUIRED`
→ **Gap this journey exposes:** this is exactly why Part 8 (Review Workflow) is needed — REVIEW is currently a dead end.

### Journey 8 — A secret is detected **[TARGET]**
User (agent) → attempts to read or pass along content containing secret-shaped data
→ Action: tool call whose resource/argument/response matches a secret pattern
→ System processing: (target) Secret Detection component scans the resource identifier and, where available, tool-call payload; raises a finding
→ Decision: `DENY` (secret resources are already policy-DENY by filename pattern today; target extends detection beyond filename matching to content/entropy-based detection)
→ Result: blocked, finding recorded
→ Audit event: `audit_logs` row **plus** a `SecurityEvent`/`Finding` row (target entities, Part 11) describing what was matched and why

### Journey 9 — Prompt injection is detected **[TARGET]**
User (agent) → is about to act on untrusted external content (e.g. a fetched web page) containing embedded instructions
→ Action: agent's next tool call is a downstream effect of manipulated content
→ System processing: (target) AI Security layer inspects content passed into context/tool-call metadata for injection-style patterns; raises risk score and/or a finding
→ Decision: elevated risk → likely `REVIEW` or `DENY` depending on the resulting action's own policy class
→ Result: flagged before (or instead of) blind execution
→ Audit event: `audit_logs` row + `SecurityEvent` describing the suspected injection
→ **Important caveat (see Part 7):** detection is heuristic, not a guarantee — this must never be documented as a complete defense.

### Journey 10 — Security engineer investigates an event **[TARGET]**
User (security engineer) → opens the dashboard's Security Events page, filters by agent/severity/time
→ Action: investigates a flagged event
→ System processing: dashboard queries (target) `GET /security-events`, `GET /audit?...`
→ Decision: engineer decides whether to escalate to review, suspend the agent, or dismiss
→ Result: possibly a `PATCH /agents/{id}/status` suspension (already exists), or a note/dismissal recorded
→ Audit event: the investigation itself should be logged as an admin action (target — admin action auditing is currently a named gap)

### Journey 11 — Developer runs an attack simulation **[TARGET]**
User (developer) → `python simulator.py --scenario credential_access` (planned usage, per `simulator/README.md`)
→ Action: runs a named scenario against a running AgentShield instance
→ System processing: simulator sends a scripted sequence of `gateway/evaluate` calls as a registered test agent
→ Decision: each call gets a real decision from the real engines
→ Result: simulator prints pass/fail against the scenario's expected outcome (e.g. "expected DENY, got DENY ✅")
→ Audit event: each simulated call produces a normal `audit_logs` row — simulations are not a special "fake" mode unless explicitly run against a scratch agent/tool

### Journey 12 — Developer reviews security analytics **[TARGET]**
User (developer/security engineer) → opens the dashboard's Risk Analytics page
→ Action: reviews trends (deny rate per agent, risk score distribution, most-triggered rules)
→ System processing: dashboard queries (target) `GET /analytics/*` aggregation endpoints over audit/security-event tables
→ Decision: informs whether a permission grant, policy rule, or agent needs attention
→ Result: possibly triggers Journey 3 (adjust permissions) or Journey 10 (investigate)
→ Audit event: analytics are read-only; no new audit event, but access to analytics itself is a candidate for admin-action auditing

---

## PART 5 — FEATURE SET

Complexity and value are qualitative (Low/Medium/High), not numeric scores.

### P0 — Foundation / Required

| Feature | Problem | User | Description | Dependencies | Security considerations | Complexity | Expected value |
|---|---|---|---|---|---|---|---|
| Audit read API (`GET /audit`, filters) | REVIEW/DENY decisions are invisible without direct DB access | Security engineer, developer | Paginated, filterable read endpoint over `audit_logs` (by agent, tool, decision, time range) | Existing `AuditRepository` | Must require admin auth; must not leak other tenants' data once multi-tenant | Low | High |
| Admin action audit trail | Admin changes (agent create/suspend, permission grant/revoke) are currently invisible, including who did it | Security engineer, administrator | Record who/when/what for every admin-API mutation | A notion of "who" — today there's only one shared admin key (see RBAC below) | Without per-operator identity this is "an admin did X," not "which admin" | Medium | High |
| Rate limiting on authentication failures | No throttling on key-guessing floods today (noted limitation in `docs/architecture.md`) | Platform engineer | Per-IP/per-credential throttle on 401s | Spring Security filter chain | Must fail closed without becoming a self-inflicted DoS vector | Medium | Medium |
| Per-operator admin identity / RBAC | Single shared admin key has no accountability or least-privilege for humans | Administrator | Replace/extend shared admin key with per-operator identities and roles | Admin action audit trail | Must not weaken the existing fail-closed admin auth while migrating | High | High |

### P1 — Core Product

| Feature | Problem | User | Description | Dependencies | Security considerations | Complexity | Expected value |
|---|---|---|---|---|---|---|---|
| Real Risk Engine (deterministic, Part 6) | Risk score is currently a stub constant | Developer, security engineer | Multi-factor deterministic score computed from resource sensitivity, action type, frequency, pattern match | Backend must call it; needs a defined failure mode | Must fail closed (treat engine-down as elevated risk, not zero risk) | Medium | High |
| Data-driven PolicyEngine | Rules are hard-coded in Java; changing a rule requires a redeploy | Security engineer | Move substring/resource rules into a stored, versioned policy table/config | New `Policy` entity | Must preserve the existing decision hierarchy (authorization still wins) | Medium | High |
| Resource-path-scoped permissions | Grants are (agent, tool, action) only — no path scoping (e.g. "READ only under `src/`") | Developer, security engineer | Optional pattern/path constraint per grant | Existing `AgentToolPermission` | Pattern matching must fail closed on ambiguous patterns | Medium | Medium |
| Review workflow (Part 8) | `REVIEW` decisions are currently a dead end | Security engineer | Persisted review queue + human decision feeding back into the audit trail | Audit read API | Reviewer identity needs the same accountability as admin actions | Medium | High |
| Minimal dashboard (Overview, Agents, Tools, Permissions, Audit Logs) | No UI exists at all | Developer, administrator | Read/manage views over existing admin + audit APIs | Audit read API | Dashboard auth must not reuse raw admin API key in browser storage long-term | High | High |

### P2 — Advanced Security

| Feature | Problem | User | Description | Dependencies | Security considerations | Complexity | Expected value |
|---|---|---|---|---|---|---|---|
| Secret detection (content/entropy-based) | Today's secret "detection" is filename substring matching only | Security engineer | Scan resource identifiers and available tool-call payloads for secret-shaped content (entropy, known key formats) | Risk Engine integration | False positives must not silently fail-open; log and REVIEW rather than ignore | Medium | High |
| Prompt injection detection (heuristic) | Agents acting on untrusted content can be hijacked; nothing inspects content today | Security engineer, developer | Heuristic scan of content entering agent context/tool-call arguments for injection patterns | AI Security layer, Security Event entity | Must be documented as heuristic, not foolproof (Part 7) | High | Medium-High |
| Tool-call argument inspection | PolicyEngine only ever sees a flat `resource` string, not structured arguments | Security engineer | Structured inspection of tool-call parameters (e.g. shell command tokens, SQL statement shape) | Depends on tool integration conventions | Must not become a bypassable blocklist-only control | High | High |
| Security event dashboard page | No visibility into flagged events | Security engineer | Dashboard page listing/filtering `SecurityEvent` records | Security Event entity, secret/injection detection | n/a (read-only) | Medium | High |

### P3 — Research / Experimental

| Feature | Problem | User | Description | Dependencies | Security considerations | Complexity | Expected value |
|---|---|---|---|---|---|---|---|
| Agent behaviour / trajectory analysis | Individually-benign actions can be dangerous in sequence (named in threat model as "out of scope — current phase") | Security engineer, researcher | Windowed analysis of an agent's recent actions per session to flag suspicious sequences | Audit data, session modeling | Must not retroactively block already-completed actions; advisory/REVIEW only at first | High | Medium (High research value) |
| ML-based anomaly detection in Risk Engine | Deterministic rules can't capture "unusual for *this* agent" | Researcher | Supervised/unsupervised model (e.g. isolation forest) trained on audit history, as an additional risk factor | Deterministic Risk Engine must exist first; enough labeled/simulated data | Model must be explainable-adjacent (contribute a factor, not a black-box override) and never the sole basis for DENY | High | Medium (High research value) |
| Context-aware risk scoring | Same action can be risky or not depending on session history, agent reputation | Researcher | Factor in agent history / trajectory signals into the risk score | Trajectory analysis | Must bound how much "history" can swing a score to avoid runaway penalization | High | Medium (High research value) |

### P4 — Future SaaS

| Feature | Problem | User | Description | Dependencies | Security considerations | Complexity | Expected value |
|---|---|---|---|---|---|---|---|
| Multi-tenancy | Currently single-tenant; no org/account boundary anywhere in the schema | Future SaaS customer | Tenant-scoped agents/tools/permissions/audit, isolated per organization | Most of the above; this is a cross-cutting rework | Must guarantee tenant isolation at the query layer, not just the UI layer | High | High (only if pursuing SaaS) |
| Billing / account management | No concept of accounts, plans, or usage metering | Future SaaS customer | Standard SaaS account lifecycle, usage-based or seat-based billing | Multi-tenancy | Payment data must never touch AgentShield's own DB directly — use a processor | High | Low until multi-tenancy exists |

---

## PART 6 — RISK ENGINE

### CURRENT

- A FastAPI service (`risk-engine/main.py`) exposing `GET /health` and `POST /score`.
- `POST /score` is a **stub**: it ignores its input and always returns `{"riskScore": 0, "factors": ["stub — scoring not yet implemented"]}`.
- The Spring Boot backend has a configured URL (`agentshield.risk-engine.url`) but **no code anywhere calls it** — `GatewayService` only talks to `PermissionEngine` and `PolicyEngine`.
- There is no ML of any kind in the repository today.

### TARGET

**Step 1 — Deterministic Risk Engine (no ML yet):**

- **Inputs:** `agentId`, `action`, `resource`, `tool`, and request `metadata` (already the shape defined in `docs/api-design.md`'s internal risk-engine contract).
- **Signals/features** (from `docs/risk-engine.md`'s planned factor table, kept deterministic):
  - Resource sensitivity (secret/admin/production pattern match) — high weight
  - Action type (`DELETE`/`EXECUTE` riskier than `READ`) — medium weight
  - Request frequency for this agent/session in a short window — medium weight
  - Resource pattern match against a maintained sensitive-pattern list — high weight
  - (Deferred to a later step) agent history / trajectory — low weight initially, since it requires session-aware state
- **Scoring approach:** a transparent weighted sum (or simple max-of-triggered-factors) over the signals above, each contributing a named, loggable reason — not a black box. 0–100 scale, consistent with the existing `riskScore` semantics already used by `PolicyEngine`.
- **Output:** `{ riskScore: int, factors: [ { name, weight, contribution, detail } ] }` — an explicit breakdown, not just a number.
- **Integration with Spring Boot:** `GatewayService` calls the Risk Engine *after* `PermissionEngine` authorizes and *alongside or feeding into* `PolicyEngine`, so that:
  - An authorization denial still short-circuits before the Risk Engine is ever called (preserves the existing, audited decision hierarchy).
  - The Risk Engine's score can either (a) replace the fixed per-rule scores `PolicyEngine` currently hard-codes, or (b) be combined with them — this is a design decision for the implementation phase, not this document, but it must **not** let the Risk Engine override an authorization denial.
- **Failure behavior:** the Risk Engine must **fail closed in risk terms** — if it is unreachable or errors, the Gateway should *not* silently treat the request as risk-free. Recommended default: treat an unreachable Risk Engine as a fixed elevated risk score (e.g. equivalent to the current REVIEW-tier) and record that the engine was unavailable, rather than defaulting to 0.
- **Explainability:** every score must carry its contributing factors so an audit/security-event record (and eventually a dashboard) can show *why* a score was high, consistent with CLAUDE.md's "explainable security decisions" principle.

**Step 2 — Future ML integration (explicitly not now):**

- Train an anomaly-detection model (e.g. isolation forest, per `docs/risk-engine.md`) on historical audit data once enough real/simulated traffic exists.
- The model should contribute **one additional factor** to the same explainable output structure above, not replace the deterministic factors.
- Model training/evaluation must be reproducible and documented (dataset source, features, evaluation metric) before being described as "working" — per CLAUDE.md's testing rule, never claim ML results that weren't actually measured.

---

## PART 7 — AI SECURITY

**None of the threats below have an implemented defense today.** The current `PolicyEngine` only pattern-matches a flat resource/action string; it does not inspect tool-call arguments, agent reasoning, model output, or external content. Everything in this section is **TARGET** design, explicitly separated from Part 1's verified current state.

| Threat | Detection approach (target) | Mitigation (target) | Where it runs | What gets logged |
|---|---|---|---|---|
| **Direct prompt injection** (adversarial user input to the agent) | Out of scope for AgentShield itself — this happens *inside* the agent/LLM, before any tool call reaches the gateway. AgentShield's control is downstream: catch the *resulting unsafe action*, not the injected prompt. | Rely on PermissionEngine/PolicyEngine catching the resulting tool call; cannot prevent the injection itself | N/A (gateway sees effects, not prompts) | The resulting gateway decision, as always |
| **Indirect prompt injection** (malicious instructions embedded in content the agent reads, e.g. a web page or file) | Heuristic scan of content metadata passed with a tool call (when the integration supplies it) for injection-style markers (e.g. "ignore previous instructions", suspicious imperative phrasing in fetched content) | Elevate risk score; route to REVIEW rather than auto-ALLOW when injection markers are present | AI Security layer, called from `GatewayService` alongside Risk Engine | `SecurityEvent` with matched pattern + the triggering resource/tool call id |
| **Secret leakage / secret detection** | Entropy + known-key-format scanning of resource identifiers and (where supplied) tool-call arguments/results, beyond today's filename-substring check | DENY on high-confidence match; REVIEW on ambiguous match | AI Security layer | `SecurityEvent` + which pattern/entropy threshold matched (never the secret value itself) |
| **Sensitive data exposure** | Classify resource/response sensitivity beyond filename heuristics (e.g. structured PII pattern matching) | Tighten `resourceSensitivity` classification feeding the existing ALLOW/REVIEW/DENY hierarchy | PolicyEngine extension | `audit_logs.resourceSensitivity` (already exists) + `SecurityEvent` if a new pattern fired |
| **Malicious/unsafe tool invocation (tool abuse)** | Per-tool allow-lists of safe argument shapes (e.g. for `SHELL`, an allow-list of command prefixes) | DENY calls outside the allow-list even if the (agent, tool, action) grant exists | PolicyEngine / new Tool-call inspection component | `SecurityEvent` with the rejected argument pattern |
| **Excessive agent permissions** | Static analysis of granted permissions vs. observed usage (e.g. agent never uses `DELETE` grant → flag as over-provisioned) | Advisory report to security engineer; does not auto-revoke | Analytics (Part 2/9) | A recommendation surfaced on the dashboard, not an audit event |
| **Context manipulation** | Detect when tool-call arguments diverge sharply from the agent's declared/typical pattern for that session | Elevate risk score, feed trajectory analysis (P3) | AI Security layer + trajectory analysis | `SecurityEvent` |
| **Data exfiltration** | Flag `EXTERNAL_REQUEST` actions whose destination is not an allow-listed domain (per `docs/threat-model.md` scenario 3) | DENY outbound calls to non-allow-listed destinations | PolicyEngine extension (needs a destination allow-list concept) | `audit_logs` (already captures EXTERNAL_REQUEST decisions) + `SecurityEvent` |
| **Malicious external content** (the agent ingests attacker-controlled data) | Same mechanism as indirect prompt injection — scan ingested content before it influences subsequent tool calls | Same as indirect prompt injection | AI Security layer | `SecurityEvent` |

**Explicit limitation to document, not hide:** heuristic/pattern-based detection (injection markers, entropy thresholds, allow-lists) will always have false negatives and false positives. CLAUDE.md's rule applies directly here: *do not claim any of these defenses is foolproof*, and every detector must state its known blind spots in its own documentation when implemented.

---

## PART 8 — REVIEW WORKFLOW (design, not implemented)

```
Agent Request
  → PermissionEngine (must already be AUTHORIZED)
  → PolicyEngine / Risk Engine evaluation
  → REVIEW
  → Security Review Queue   (new, persisted)
  → Human Decision           (reviewer identity required)
  → ALLOW / DENY             (final, overrides the provisional REVIEW)
  → Audit                    (linked to the original audit_logs row)
```

### Review object (conceptual fields, not a schema)
- `id`
- `auditLogId` — the originating `audit_logs` row this review is attached to (FK relationship, one review per reviewable decision)
- `agentId`, `tool`, `action`, `resource` — denormalized for queue display without a join
- `riskScore`, `reason` — carried over from the original evaluation
- `status` — `PENDING` / `IN_REVIEW` / `DECIDED`
- `reviewerId` — who is/was handling it (requires the per-operator admin identity from Part 5/P0)
- `decisionReason` — free text explaining the human call
- `finalDecision` — `ALLOW` or `DENY` (a human cannot leave something ambiguously "reviewed"; they must resolve it)
- `createdAt`, `decidedAt`

### Review status lifecycle
`PENDING` → `IN_REVIEW` (a reviewer claims it) → `DECIDED` (terminal; re-opening requires a new review record, not mutating history)

### Audit relationship
- The original `audit_logs` row is never mutated after the fact (audit integrity).
- The review's `finalDecision` is recorded as a **new, linked** audit event referencing the original `requestId`, so the full history — "system said REVIEW, human said ALLOW, at this time, by this reviewer" — is reconstructable.
- This mirrors the existing principle in `docs/architecture.md` that authorization denials and policy decisions are never silently overwritten — only appended to.

---

## PART 9 — DASHBOARD REQUIREMENTS (target — `frontend/` is currently empty)

| Page | Purpose | Main information | Main actions | Important states | Security considerations |
|---|---|---|---|---|---|
| **Overview** | At-a-glance system health and recent activity | Decision counts (ALLOW/REVIEW/DENY) over time, active agent count, pending reviews | Drill into any stat | Loading, empty (no activity yet), error (backend unreachable) | Must not leak sensitive resource identifiers in a shared/demo view without access control |
| **Agents** | Manage registered agents | List with status, created date, last activity | Register, suspend/reactivate, revoke, rotate key | Unauthorized (non-admin), key-just-rotated (show once, then never again) | Never re-display a past API key; rotate flow must warn it's irreversible |
| **Tools** | Manage registered tools | List with type/status | Register, enable/disable | Loading, empty | n/a beyond standard admin auth |
| **Permissions** | Manage agent↔tool grants | Grants by agent or by tool, allowed actions, enabled flag | Grant, revoke, toggle enabled | Conflict (grant already exists), empty | Must make over-broad grants (e.g. all actions) visually obvious |
| **Security Events** | Investigate flagged AI-security findings | List/filter by severity, agent, type (secret/injection/etc.) | Filter, open detail, link to related audit row, escalate to review | Empty (nothing flagged — good state, should read as "clear," not broken), loading | Must redact actual secret values even in event detail view |
| **Review Queue** | Resolve REVIEW decisions | Pending/in-review/decided items, risk score, reason | Claim, decide ALLOW/DENY with reason | Empty queue, item already claimed by someone else (race) | Reviewer identity required; decisions must be attributable |
| **Risk Analytics** | Spot trends before they become incidents | Risk score distribution, top triggered rules, deny rate per agent/tool | Change time range, drill into an agent/tool | Insufficient data (new system), loading | Aggregation only — must not expose raw resource contents |
| **Simulator** | Run/review attack scenarios from the UI | Available scenarios, last run results, pass/fail per expected outcome | Run a scenario, view generated audit trail | Running (long operation), scenario failed to match expectation | Must run against clearly-labeled test agents, never silently against production-looking agents |
| **Policies** | View/manage policy rules once data-driven | Rule list, what triggers each, current decision tier | Create/edit/disable a rule (admin only) | Validation error (conflicting rule), unsaved changes | Rule edits are high-blast-radius — require confirmation and should themselves be audited |
| **Audit Logs** | Full forensic trail | Searchable/filterable table of all evaluations | Filter by agent/tool/decision/date, export, open detail | Empty, large-result pagination | Read-only; must enforce admin auth and (future) tenant scoping |
| **Settings** | Operational configuration | Admin identity/RBAC management, rate-limit thresholds, risk-engine connectivity status | Manage operators/roles, rotate admin credentials | Risk engine unreachable (should be visibly flagged, not hidden) | Highest-privilege page in the app — needs its own stricter access control |

---

## PART 10 — API REQUIREMENTS (target surface — not implemented beyond what's marked CURRENT)

### Authentication
| Method | Path | Purpose | Auth | AuthZ | Request concept | Response concept |
|---|---|---|---|---|---|---|
| — | *(header-based, no endpoint)* `X-Agent-API-Key` / `Authorization: Bearer` | **[CURRENT]** Authenticate an agent | Agent key | — | header only | 401 on failure |
| — | *(header-based)* `X-Admin-API-Key` | **[CURRENT]** Authenticate an admin | Admin key | — | header only | 401 on failure |

### Agents
| Method | Path | Purpose | Auth | AuthZ | Request concept | Response concept |
|---|---|---|---|---|---|---|
| POST | `/api/v1/agents` | **[CURRENT]** Register agent | Admin key | ROLE_ADMIN | name, description | agent + one-time API key |
| GET | `/api/v1/agents` | **[CURRENT]** List agents | Admin key | ROLE_ADMIN | — | agent list |
| GET | `/api/v1/agents/{id}` | **[CURRENT]** Get agent | Admin key | ROLE_ADMIN | — | agent |
| PATCH | `/api/v1/agents/{id}/status` | **[CURRENT]** Change status | Admin key | ROLE_ADMIN | status | agent |
| POST | `/api/v1/agents/{id}/rotate-key` | **[CURRENT]** Rotate key | Admin key | ROLE_ADMIN | — | new one-time API key |

### Tools
| Method | Path | Purpose | Auth | AuthZ | Request concept | Response concept |
|---|---|---|---|---|---|---|
| POST | `/api/v1/tools` | **[CURRENT]** Register tool | Admin key | ROLE_ADMIN | name, description, toolType | tool |
| GET | `/api/v1/tools` | **[CURRENT]** List tools | Admin key | ROLE_ADMIN | — | tool list |
| GET | `/api/v1/tools/{id}` | **[CURRENT]** Get tool | Admin key | ROLE_ADMIN | — | tool |
| PATCH | `/api/v1/tools/{id}/status` | **[CURRENT]** Change status | Admin key | ROLE_ADMIN | status | tool |

### Permissions
| Method | Path | Purpose | Auth | AuthZ | Request concept | Response concept |
|---|---|---|---|---|---|---|
| POST | `/api/v1/permissions` | **[CURRENT]** Grant permission | Admin key | ROLE_ADMIN | agentId, toolId, allowedActions, enabled | grant |
| GET | `/api/v1/permissions/agent/{agentId}` | **[CURRENT]** List an agent's grants | Admin key | ROLE_ADMIN | — | grant list |
| DELETE | `/api/v1/permissions/{id}` | **[CURRENT]** Revoke grant | Admin key | ROLE_ADMIN | — | 204 |
| PATCH | `/api/v1/permissions/{id}` | **[TARGET]** Edit a grant in place (today requires revoke+re-grant) | Admin key | ROLE_ADMIN | allowedActions, enabled, resource pattern | grant |

### Gateway
| Method | Path | Purpose | Auth | AuthZ | Request concept | Response concept |
|---|---|---|---|---|---|---|
| POST | `/api/v1/gateway/evaluate` | **[CURRENT]** Evaluate a tool-call request | Agent key | ROLE_AGENT | agentId, sessionId, tool, action, resource, metadata | decision, reason, riskScore, authorizationResult |

### Policies
| Method | Path | Purpose | Auth | AuthZ | Request concept | Response concept |
|---|---|---|---|---|---|---|
| GET | `/api/v1/policies` | **[TARGET]** List policy rules (once data-driven) | Admin key | ROLE_ADMIN | — | rule list |
| POST | `/api/v1/policies` | **[TARGET]** Create a rule | Admin key | ROLE_ADMIN | pattern, action, decision, riskScore | rule |
| PATCH | `/api/v1/policies/{id}` | **[TARGET]** Edit/disable a rule | Admin key | ROLE_ADMIN | fields to change | rule |

### Risk
| Method | Path | Purpose | Auth | AuthZ | Request concept | Response concept |
|---|---|---|---|---|---|---|
| POST | `/score` (risk-engine, internal) | **[CURRENT — stub only]** Compute a risk score | Internal network only | — | agentId, action, resource, metadata | riskScore, factors (currently a fixed stub value) |
| GET | `/api/v1/risk/factors` | **[TARGET]** Expose scoring factor definitions for dashboard explainability | Admin key | ROLE_ADMIN | — | factor list with weights |

### Security Events
| Method | Path | Purpose | Auth | AuthZ | Request concept | Response concept |
|---|---|---|---|---|---|---|
| GET | `/api/v1/security-events` | **[TARGET]** List/filter flagged events | Admin key | ROLE_ADMIN | filters (agent, type, severity, time) | event list |
| GET | `/api/v1/security-events/{id}` | **[TARGET]** Event detail | Admin key | ROLE_ADMIN | — | event (secrets redacted) |

### Reviews
| Method | Path | Purpose | Auth | AuthZ | Request concept | Response concept |
|---|---|---|---|---|---|---|
| GET | `/api/v1/reviews` | **[TARGET]** List review queue | Admin key (reviewer) | ROLE_ADMIN (or future ROLE_REVIEWER) | status filter | review list |
| POST | `/api/v1/reviews/{id}/claim` | **[TARGET]** Claim a pending review | Admin key | ROLE_ADMIN | — | review (status IN_REVIEW) |
| POST | `/api/v1/reviews/{id}/decide` | **[TARGET]** Record human decision | Admin key | ROLE_ADMIN | finalDecision, decisionReason | review (status DECIDED) |

### Simulator
| Method | Path | Purpose | Auth | AuthZ | Request concept | Response concept |
|---|---|---|---|---|---|---|
| GET | `/api/v1/simulator/scenarios` | **[TARGET]** List available scenarios | Admin key | ROLE_ADMIN | — | scenario list |
| POST | `/api/v1/simulator/run` | **[TARGET]** Run a scenario (invokes the simulator against a test agent) | Admin key | ROLE_ADMIN | scenario id | run result, pass/fail, generated audit refs |

### Analytics
| Method | Path | Purpose | Auth | AuthZ | Request concept | Response concept |
|---|---|---|---|---|---|---|
| GET | `/api/v1/analytics/decisions` | **[TARGET]** Decision counts over time | Admin key | ROLE_ADMIN | time range, grouping | aggregated counts |
| GET | `/api/v1/analytics/agents/{id}/risk-trend` | **[TARGET]** Per-agent risk trend | Admin key | ROLE_ADMIN | time range | time series |

### Audit (also referenced in Part 1/5)
| Method | Path | Purpose | Auth | AuthZ | Request concept | Response concept |
|---|---|---|---|---|---|---|
| GET | `/api/v1/audit` | **[TARGET — already named "Planned" in `docs/api-design.md`]** List audit entries | Admin key | ROLE_ADMIN | filters | audit list |
| GET | `/api/v1/audit/{id}` | **[TARGET]** Get a specific entry | Admin key | ROLE_ADMIN | — | audit entry |

---

## PART 11 — DATABASE REQUIREMENTS (conceptual — no schema changes made)

### CURRENT ENTITIES (exist today, verified against JPA entities and Flyway migrations)

| Entity | Key fields | Notes |
|---|---|---|
| `Agent` | id, name (unique), description, status, apiKeyHash, apiKeyPrefix, createdAt/updatedAt | Status lifecycle `ACTIVE`/`SUSPENDED`/`REVOKED`; only HMAC hash of the key is stored |
| `Tool` | id, name (unique), description, toolType, status, createdAt/updatedAt | Status `ACTIVE`/`DISABLED` |
| `AgentToolPermission` | id, agent (FK), tool (FK), allowedActions (child table), enabled, createdAt/updatedAt | Unique on (agent, tool); actions stored one-row-per-action in `agent_tool_permission_actions` |
| `AuditLog` | id, requestId, agentId (claimed), sessionId, tool, action, resource, resourceSensitivity, decision, riskScore, reason, actionOutcome, registeredAgentId, registeredToolId, authorizationResult, authorizationReason, timestamp | Captures both claimed and authenticated identity for impersonation visibility |

### FUTURE ENTITIES (not implemented; conceptual shape only)

| Entity | Purpose | Key fields (conceptual) | Relationship |
|---|---|---|---|
| `Policy` | Data-driven replacement for hard-coded PolicyEngine rules | pattern, actionType, decisionTier, riskScore, enabled, version | Referenced by PolicyEngine at evaluation time; versioned for auditability of rule changes |
| `SecurityEvent` | Findings from the AI Security layer (secret detection, injection detection, etc.) | type, severity, agentId, relatedAuditLogId, detail (redacted), detectedAt | 1:1 or 1:N with `AuditLog` via `relatedAuditLogId` |
| `RiskAssessment` | Persisted breakdown of a risk score's contributing factors (if not embedded directly in `AuditLog`) | requestId, factors (list of name/weight/contribution), totalScore | 1:1 with the `AuditLog` row for that request |
| `Review` | Human review of a REVIEW decision | auditLogId (FK), status, reviewerId, decisionReason, finalDecision, createdAt/decidedAt | 1:1 with the originating `AuditLog` row |
| `SimulationRun` | Record of a simulator execution | scenarioId, startedAt, finishedAt, result, generatedRequestIds | References the `AuditLog` rows it generated |
| `Finding` | Generic term used loosely elsewhere in this document for a `SecurityEvent` row — treat as the same concept; avoid introducing two overlapping entities | — | — |
| `AdminActionLog` | Accountability for admin-API mutations (Part 5 P0 gap) | operatorId, action, targetType, targetId, timestamp | Independent of `AuditLog` (which is about agent requests, not admin actions) |
| Tenant / Organization (P4 only) | Multi-tenancy boundary | id, name, plan | Would become a foreign key on every entity above — explicitly out of scope until multi-tenancy is actually pursued |

---

## PART 12 — SECURITY ARCHITECTURE (target, building on current)

| Area | Current (keep as-is) | Target additions |
|---|---|---|
| **Authentication** | Agent/admin API keys via Spring Security filter chains, stateless | Optional mTLS for agents; key expiry with overlapping rotation grace period |
| **Authorization** | Deterministic `PermissionEngine`, fail-closed, first-failure-wins | Resource-path-scoped grants; time-boxed grants |
| **API keys** | `agk_live_` + 32 base62 chars, HMAC-SHA256 + pepper hash, shown once | Per-operator admin keys/identities replacing the single shared admin key |
| **Secrets** | Env-var only (`AGENTSHIELD_API_KEY_PEPPER`, `AGENTSHIELD_ADMIN_API_KEY`), app refuses to start if missing/short | No change in principle; add secret-manager integration guidance for production deploys |
| **Database security** | Flyway-owned schema, `ddl-auto=validate`, parameterized JPA queries (no raw SQL string-building observed) | Row-level tenant isolation if/when multi-tenancy is pursued (P4) |
| **Input validation** | `jakarta.validation` on DTOs (`@Valid`), name regex enforced at entity-creation | Validation for new fields (policy patterns, review decisions) must follow the same discipline |
| **Rate limiting** | None today (named limitation in `docs/architecture.md`) | Per-credential/per-IP throttling on repeated 401s and on `/gateway/evaluate` bursts |
| **Auditability** | Every non-401 gateway decision is audited; 401s are logged but not audited | Add admin-action auditing; add review-decision auditing (Part 8) |
| **Least privilege** | Deny-by-default authorization; agents can do nothing until explicitly granted | Default-deny should extend to any new capability (e.g. a new agent should not implicitly get dashboard/API access) |
| **Fail-closed behavior** | Authorization denial forces `riskScore=100`; missing secrets prevent startup | Risk Engine unreachable must not default to riskScore 0 (Part 6); AI Security detectors erroring must not silently pass content through |
| **Tenant isolation (future SaaS)** | N/A — single tenant today | Explicitly deferred to P4; must not be implied as present anywhere in current APIs/UI before it exists |

---

## PART 13 — RESEARCH NOVELTY

*Novelty is not claimed as proven anywhere below — these are candidate research directions consistent with the gaps already identified in `docs/research-notes.md`'s "Open Questions."*

### Explainable agent risk scoring
- **Existing problem:** most agent/LLM risk tooling either gives an opaque score or none at all; `docs/research-notes.md` already flags "how do you define normal agent behaviour" as open.
- **Proposed approach:** the factor-breakdown risk score in Part 6 — every score ships with named, weighted contributing factors.
- **Research question:** does exposing per-factor explanations measurably improve a human reviewer's speed/accuracy on REVIEW decisions compared to a bare number?
- **What to measure:** reviewer decision time and agreement-with-ground-truth on a labeled set of REVIEW cases, with vs. without factor breakdown shown.
- **Dataset/simulation requirements:** a labeled set of simulated requests with known "should have been ALLOW/DENY" ground truth (the simulator's planned scenarios are a direct source).

### Dynamic tool authorization
- **Existing problem:** permissions today are static grants; no literature-grounded standard exists for *when* a grant should adapt based on context.
- **Proposed approach:** resource-path-scoped and time-boxed grants (Part 5/11) as a first step toward context-conditioned authorization.
- **Research question:** can authorization scope be safely narrowed/widened automatically based on session risk without introducing a new bypass vector?
- **What to measure:** rate of false-DENY (legitimate work blocked) vs. false-ALLOW (unsafe action permitted) under a dynamic-scoping policy vs. the current static one.
- **Dataset/simulation requirements:** simulated multi-step agent sessions with varying legitimate task shapes.

### Agent behaviour analysis
- **Existing problem:** `docs/threat-model.md` explicitly lists trajectory attacks as "planned analysis," not yet modeled.
- **Proposed approach:** windowed per-session action sequences as an additional risk factor (Part 5/P3).
- **Research question:** what sequence-level signal best distinguishes a benign multi-step task from a scope-creep/trajectory attack, given only the fields already captured in `audit_logs`?
- **What to measure:** precision/recall of trajectory-based flags against the simulator's labeled `scope_escalation` and `trajectory_attack` scenarios (already named in `simulator/README.md`).
- **Dataset/simulation requirements:** simulator must generate both benign multi-step sequences and the named attack sequences in comparable volume to avoid trivial class imbalance.

### Security trajectory analysis
- (Closely related to the above — kept distinct because it emphasizes *session-level* risk aggregation rather than individual-action sequencing.)
- **Existing problem:** a single request's risk score can't capture "this session is drifting toward danger."
- **Proposed approach:** a session-level rolling risk aggregate, surfaced on the dashboard per `sessionId`.
- **Research question:** does a session-level aggregate reduce time-to-detection for a multi-step attack compared to per-request scoring alone?
- **What to measure:** number of requests elapsed before a trajectory crosses a review/deny threshold, across simulated attack runs.
- **Dataset/simulation requirements:** same simulator scenarios as above, run many times with randomized benign noise mixed in.

### Hybrid deterministic + ML risk detection
- **Existing problem:** pure rule-based scoring is explainable but brittle to novel attack patterns; pure ML is adaptive but opaque — `docs/risk-engine.md` already plans this split (Phase 3 rules, Phase 6 ML).
- **Proposed approach:** the Part 6 design where ML contributes one *named, bounded* factor alongside deterministic ones, never replacing them.
- **Research question:** does adding an anomaly-detection factor improve detection of previously-unseen attack patterns without degrading explainability or increasing false-positive rate on benign traffic?
- **What to measure:** detection rate on held-out novel simulated attack variants not used in training, plus false-positive rate on a benign traffic sample.
- **Dataset/simulation requirements:** enough simulated/real audit volume to train on, with a held-out novel-variant test set generated separately from the training generator to avoid leakage.

### AI-specific policy enforcement
- **Existing problem:** most existing policy-engine literature (RBAC/ABAC, WAFs) targets human/web traffic, not LLM-driven tool calls with natural-language-derived arguments.
- **Proposed approach:** the tool-call argument inspection and AI Security layer in Part 7, specifically scoped to LLM-agent tool-call shapes rather than generic request filtering.
- **Research question:** do LLM-agent tool calls have exploitable structural regularities (vs. human-originated requests) that make targeted detection more effective than generic WAF-style rules?
- **What to measure:** detection/false-positive rates of AgentShield's AI-specific rules vs. a generic rule set, on the same simulated traffic.
- **Dataset/simulation requirements:** simulated traffic must include both LLM-agent-shaped and generic-API-shaped requests for a fair comparison.

### Context-aware risk scoring
- **Existing problem:** identical actions can have very different risk depending on what preceded them; today's `PolicyEngine` has no memory at all.
- **Proposed approach:** the context-aware factor described in Part 5/P3, bounded so history cannot swing a score indefinitely.
- **Research question:** what is the right decay/window function for "recent history" such that it improves detection without causing unbounded risk inflation for long-lived, legitimately active agents?
- **What to measure:** false-positive rate on long-running simulated benign agents as a function of session length, under different decay functions.
- **Dataset/simulation requirements:** simulator must support long-running benign sessions, not just short attack scenarios, to stress-test this.

---

## PART 14 — IMPLEMENTATION ROADMAP

### Phase 0 — Current foundation *(DONE — verified)*
- **Features:** Agent identity, Tool registry, AgentToolPermission grants, PermissionEngine, PolicyEngine, GatewayService orchestration, agent/admin API-key auth, Flyway/PostgreSQL, backend tests, CI (backend + risk-engine + security scan).
- **Dependencies:** none (this is the baseline).
- **Tests:** existing JUnit unit/integration suite (`PermissionEngineTest`, `PolicyEngineTest`, `ApiKeyHasherTest`, `ApiKeyGeneratorTest`, `DatabaseMigrationTest`, controller integration tests).
- **Deliverables:** already merged on `feature/agent-authentication` and prior branches.
- **Definition of Done:** already met — `mvn clean test package` passes; documented in `docs/architecture.md`.

### Phase 1 — Complete backend security foundation
- **Features:** Audit read API, admin action audit trail, rate limiting on auth failures, per-operator admin RBAC.
- **Dependencies:** Phase 0.
- **Tests:** integration tests for new read endpoints and rate-limit thresholds; regression tests confirming existing auth/authorization behavior is unchanged.
- **Deliverables:** `GET /audit[/{id}]`, admin-action logging, documented rate-limit config.
- **Definition of Done:** no existing PermissionEngine/PolicyEngine/AuditService test regresses; new endpoints require admin auth and are covered by tests.

### Phase 2 — Risk Engine
- **Features:** deterministic multi-factor scoring (Part 6 Step 1), backend integration call from `GatewayService`, defined failure behavior.
- **Dependencies:** Phase 0 (does not strictly need Phase 1).
- **Tests:** risk-engine pytest suite per factor; backend integration test for Risk-Engine-down failure mode.
- **Deliverables:** real `POST /score`, backend call path, explainable factor output.
- **Definition of Done:** Risk Engine down does not produce riskScore 0; every score has a non-empty factor breakdown.

### Phase 3 — AI security detection
- **Features:** secret detection (entropy/pattern), indirect-prompt-injection heuristics, tool-call argument inspection, `SecurityEvent` entity.
- **Dependencies:** Phase 2 (feeds risk scoring).
- **Tests:** detector unit tests against both known-bad and known-benign fixtures; explicit false-positive-rate tracking.
- **Deliverables:** `SecurityEvent` persistence, `GET /security-events`.
- **Definition of Done:** every detector's known limitations are documented alongside its code, per CLAUDE.md's "do not claim foolproof" rule.

### Phase 4 — Review workflow
- **Features:** `Review` entity, claim/decide endpoints, linkage back to `AuditLog`.
- **Dependencies:** Phase 1 (reviewer identity needs per-operator RBAC).
- **Tests:** integration tests for the full REVIEW → queued → decided → audited lifecycle.
- **Deliverables:** `/api/v1/reviews/*` endpoints.
- **Definition of Done:** a REVIEW decision can be fully traced from original request to final human decision via audit records.

### Phase 5 — Frontend / dashboard
- **Features:** Overview, Agents, Tools, Permissions, Audit Logs, Security Events, Review Queue pages (Part 9).
- **Dependencies:** Phases 1, 3, 4 (needs the APIs those phases expose).
- **Tests:** component tests (Vitest/RTL) for key pages; at least one E2E happy-path (Playwright) per CLAUDE.md's testing preferences.
- **Deliverables:** a running Next.js app consuming the existing + new APIs.
- **Definition of Done:** every page handles loading/empty/error states (per Part 9), and no admin API key is persisted insecurely in the browser.

### Phase 6 — Simulator
- **Features:** implement the scenarios already named in `simulator/README.md` (`basic_read_write`, `credential_access`, `scope_escalation`, `rapid_fire`, `trajectory_attack`).
- **Dependencies:** Phase 0 minimum; richer scenarios benefit from Phase 2/3.
- **Tests:** simulator's own assertions (expected vs. actual decision per scenario).
- **Deliverables:** working `simulator.py` plus (optional) `/api/v1/simulator/*` if dashboard-triggered runs are desired.
- **Definition of Done:** each documented scenario produces its documented expected decision against a real running backend.

### Phase 7 — Analytics
- **Features:** decision/risk aggregation endpoints, Risk Analytics dashboard page.
- **Dependencies:** Phase 2 (risk factors to aggregate), Phase 5 (dashboard to display them).
- **Tests:** aggregation correctness tests against known fixture audit data.
- **Deliverables:** `/api/v1/analytics/*`, dashboard page.
- **Definition of Done:** aggregates match hand-computed expectations on fixture data.

### Phase 8 — Testing / security hardening
- **Features:** expanded security test coverage (impersonation, replay, rate-limit bypass attempts), dependency/vulnerability review, review of all new endpoints against the Part 12 security architecture checklist.
- **Dependencies:** all prior phases (this is a hardening pass over everything built).
- **Tests:** security-focused test suite; re-run of `security-checks.yml`-style scanning against the expanded surface.
- **Deliverables:** a documented security review (per the existing `/security-review` process already available in this environment).
- **Definition of Done:** no unresolved high-severity finding; fail-closed behavior verified for every new component (Risk Engine, detectors, review workflow).

### Phase 9 — Docker / CI / CD / deployment
- **Features:** uncomment and complete the backend/risk-engine/frontend blocks in `docker-compose.yml`, add Dockerfiles for frontend, extend CI to cover frontend tests, document a real deployment path.
- **Dependencies:** Phases 5–7 need real services to containerize.
- **Tests:** CI pipeline itself is the test (build succeeds, containers start, health checks pass).
- **Deliverables:** `docker compose up --build` brings up the full stack as already described (aspirationally) in `README.md`.
- **Definition of Done:** a fresh clone can run the full stack locally from `docker compose up --build` with only `.env` secrets supplied.

---

## PART 15 — MVP

### What is included
- Everything in **Phase 1** (audit read API, admin action audit, basic rate limiting, per-operator admin identity) — makes the existing, already-solid authorization engine *operable* by a human instead of only queryable via SQL.
- **Phase 2**'s deterministic Risk Engine — replaces the stub with real, explainable scoring, which is the single most credible missing piece relative to the project's own stated purpose.
- **Phase 4**'s review workflow — closes the "REVIEW is a dead end" gap (Journey 7), which is the most visible functional hole in the current product.
- A minimal slice of **Phase 5** — just Overview, Agents, Audit Logs, and Review Queue pages, enough to demo the full loop visually.
- A minimal slice of **Phase 6** — just the `credential_access` and `scope_escalation` scenarios from `simulator/README.md`, enough to prove the gateway blocks what it claims to.

### What is excluded (and why)
- **Secret/prompt-injection detection (Phase 3):** valuable but the MVP's job is to prove the *existing* identity/permission/risk/review loop works end-to-end first; AI-specific detection is additive, not foundational, and has the highest false-positive risk if rushed.
- **Full dashboard (remaining Phase 5 pages), Analytics (Phase 7):** nice-to-have visibility, not required to demonstrate the core security value.
- **ML risk scoring:** explicitly deferred — the deterministic engine must exist and be trusted first; ML without a baseline to compare against isn't credible.
- **Multi-tenancy/billing (P4):** out of scope for any near-term MVP; this is a single-tenant security gateway today and should stay one until there's a real reason to generalize.

### Demo flow
1. Register an agent and a `filesystem` tool; grant `READ` only (existing Phase 0 flow).
2. Agent calls `gateway/evaluate` for `READ` on a normal file → `ALLOW`, visible in the new Audit Logs page.
3. Agent calls `gateway/evaluate` for `READ` on `.env` → `DENY` (existing PolicyEngine rule), risk score now comes from the real deterministic Risk Engine with a visible factor breakdown instead of a hard-coded constant.
4. Agent calls `gateway/evaluate` for a non-production `DELETE` → `REVIEW`, appears in the Review Queue; a reviewer claims it and decides `DENY` with a reason — the full Journey 7 loop, now closed.
5. Run the `scope_escalation` simulator scenario live, showing the same engine enforcing the same boundaries against a scripted attack sequence.

This demonstrates identity, authorization, explainable risk, and human review — the core security value proposition — without requiring AI-specific detection, a full dashboard, or ML to exist yet.

---

## PART 16 — FINAL RECOMMENDATION

1. **Recommended product scope:** a single-tenant, developer-focused runtime security gateway for AI agents, built on the already-solid identity/permission/audit foundation, extended with a real explainable risk engine and a human review loop. Treat AI-specific detection (secret/injection/tool-abuse) as the next major increment, and treat SaaS multi-tenancy/billing as out of scope until there's a concrete reason to pursue it.

2. **Recommended MVP:** Phase 1 (operability) + Phase 2 (real risk engine) + Phase 4 (review workflow) + a thin slice of Phase 5 (dashboard) + a thin slice of Phase 6 (simulator), as detailed in Part 15. This is the smallest set that turns "a deterministic authorization engine with a dead-end REVIEW status" into "a demonstrably complete security control loop."

3. **Recommended architecture direction:** do not redesign `PermissionEngine`, `PolicyEngine`, or the authentication filter chains — they are correct, tested, and load-bearing. Build everything new *around* them: the Risk Engine and AI Security layer should contribute inputs into decisions, never bypass the existing authorization-first hierarchy; the review workflow should wrap REVIEW outcomes without ever mutating existing audit rows.

4. **Recommended implementation order:** Phase 1 → 2 → 4 → (thin) 5/6 for the MVP, then 3 (AI security) → 7 (analytics) → remaining 5 (full dashboard) → 8 (hardening) → 9 (deployment). This order prioritizes closing existing functional gaps (operability, review) before adding net-new detection surface area.

5. **Biggest technical risks:** (a) letting the Risk Engine or AI Security layer silently fail open (e.g. defaulting to riskScore 0 when unreachable) would quietly undermine the fail-closed guarantee that makes the rest of the system trustworthy; (b) a data-driven PolicyEngine, if done carelessly, could re-introduce the exact hard-coded-rule problem it's meant to fix, just stored in a table instead of Java; (c) the single shared admin key must be replaced *before* an admin action audit trail is meaningful — logging "an admin did X" without knowing which admin is a false sense of accountability.

6. **Biggest security risks:** (a) heuristic AI-security detectors (injection/secret detection) creating a false sense of complete protection if their limitations aren't documented and surfaced — this is explicitly called out in Part 7 and must not be relaxed under deadline pressure; (b) the review workflow becoming a rubber-stamp if reviewer accountability (per-operator identity) isn't in place first; (c) any future multi-tenancy work must get tenant isolation right at the query layer from day one — retrofitting it onto a single-tenant schema is a well-known source of cross-tenant data leaks.

7. **Biggest research opportunities:** the hybrid deterministic+ML risk scoring and trajectory/session-level analysis directions (Part 13) are the most distinctive relative to generic API-gateway/WAF literature, specifically because they're scoped to *LLM-agent-shaped* tool-call traffic rather than generic HTTP traffic — that framing (not the ML technique itself) is where AgentShield's most defensible research contribution likely sits, provided it's validated against real measurement (detection/false-positive rates on labeled simulated traffic) rather than asserted.
