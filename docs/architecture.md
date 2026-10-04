# Architecture Overview

> **Status:** Core Security Gateway (1A) + Agent Identity, Tool Registry & Permissions (1B) + Agent Authentication, Admin API Security & Flyway Migrations (1C) + Risk Engine Gateway Integration (Phase 2 — deterministic, escalation-only; see [Risk Engine Integration](#risk-engine-integration)) + Human Review Workflow (Phase 3 — see [Human Review Workflow](#human-review-workflow)) + Audit Read API (Phase 4 — see [Audit Read API](#audit-read-api))

---

## System Overview

AgentShield is a runtime security gateway that intercepts every tool call made by an AI agent and enforces security decisions before the call reaches the target resource.

Milestone 1B changes the question the gateway answers from *"Is this action risky?"* to:

> **WHO** is requesting this action, **WHAT** tool are they using, and **WHAT** is that agent actually allowed to do — and only then, *how risky is it?*

Milestone 1C makes the **WHO** verifiable: every gateway request must be authenticated with the agent's own API key, and the administrative APIs require an admin key.

```
┌─────────────────────┐
│  Client / AI Agent  │
└─────────┬───────────┘
          │  POST /api/v1/gateway/evaluate
          │  X-Agent-API-Key: agk_live_…  (or Authorization: Bearer …)
          ▼
┌───────────────────────────────────────────────────────────────┐
│                  AgentShield Security Gateway                 │
│                                                               │
│  AgentApiKeyAuthenticationFilter (Spring Security)            │
│    missing/invalid/revoked key ──► HTTP 401 (not evaluated)   │
│                             │ authenticated agent (principal) │
│                             ▼                                 │
│  GatewayController ──► GatewayService (orchestration only)    │
│                             │                                 │
│                             ▼                                 │
│   ┌──────────────────── PermissionEngine ─────────────────┐   │
│   │ 1. Identity claim   (body agentId == caller?)         │   │
│   │ 2. Agent status     (ACTIVE?)                         │   │
│   │ 3. Tool registry    (registered? ACTIVE?)             │   │
│   │ 4. Permission grant (exists? enabled? action listed?) │   │
│   └──────────┬──────────────────────────────┬─────────────┘   │
│              │ AUTHORIZED                   │ anything else   │
│              ▼                              ▼                 │
│   ┌───────────────────────┐          DENY (risk 100)          │
│   │     PolicyEngine      │               │                   │
│   │ resource/action risk  │               │                   │
│   └──────────┬────────────┘               │                   │
│      ALLOW / REVIEW        │ DENY         │                   │
│              │             └──────────────┤ (Risk Engine      │
│              ▼                            │  not consulted)   │
│   ┌───────────────────────┐               │                   │
│   │   RiskEngineClient    │               │                   │
│   │ (Python Risk Engine,  │               │                   │
│   │  escalation signal    │               │                   │
│   │  only — see below)    │               │                   │
│   └──────────┬────────────┘               │                   │
│              ▼                            │                   │
│   DecisionEscalator.combine(…)            │                   │
│      ALLOW / REVIEW / DENY                │                   │
│              └──────────────┬─────────────┘                   │
│                             ▼                                 │
│          AuditService ──► PostgreSQL ◄── RiskAssessmentService│
│                             │                                 │
│                 final decision == REVIEW?                     │
│                             │ yes                              │
│                             ▼                                 │
│                  ReviewRequestService ──► PostgreSQL           │
│                  (PENDING review_requests row; see             │
│                   Human Review Workflow below)                 │
└─────────────────────────────┬─────────────────────────────────┘
                              ▼
               Protected Tool / API / Resource
```

---

## Components

### Backend (Spring Boot 3.5.12, Java 17)

Layering: **Controller → Service → Engine → Repository**. Controllers contain no business rules;
authorization lives only in `PermissionEngine`; security policy lives only in `PolicyEngine`.

```
com.agentshield.gateway     — GatewayController, GatewayService (orchestrates permission → policy →
                              risk engine → DecisionEscalator → audit), DecisionEscalator
com.agentshield.agent       — Agent entity, AgentRepository, AgentService, AgentController
com.agentshield.tool        — Tool entity, ToolRepository, ToolService, ToolController
com.agentshield.permission  — AgentToolPermission entity + repository, PermissionService,
                              PermissionController, PermissionEngine, AuthorizationDecision
com.agentshield.security    — SecurityConfig (filter chains), Agent/Admin API key filters,
                              AgentApiKeyAuthenticator, ApiKeyGenerator, ApiKeyHasher, AuthenticatedAgent
com.agentshield.policy      — PolicyEngine & deterministic risk baseline
com.agentshield.riskengine  — RiskEngineClient / HttpRiskEngineClient (calls the Python Risk Engine),
                              RiskAssessment, RiskFactor, RiskAssessmentRecord/Repository/Service
                              (risk_assessments persistence)
com.agentshield.review      — ReviewRequest entity, ReviewRequestRepository, ReviewRequestService
                              (state machine), ReviewRequestController (human review workflow,
                              see Human Review Workflow below)
com.agentshield.audit       — AuditLog entity, AuditRepository (+ Specification-based
                              filtering), AuditLogSpecifications, AuditService,
                              AuditController (Audit Read API, Phase 4 — see
                              Audit Read API below)
com.agentshield.model       — ActionType, DecisionType, ResourceSensitivity, ActionOutcome, RiskTier,
                              ReviewStatus, AgentStatus, ToolStatus, ToolType, AuthorizationResult enums
com.agentshield.dto         — Request / response DTOs
com.agentshield.exception   — ResourceNotFoundException (404), ConflictException (409)
com.agentshield.config      — GlobalExceptionHandler
```

### Risk Engine (Python / FastAPI) — Phase 1 scoring implemented, Phase 2 gateway integration implemented

A standalone, independently runnable and testable service (`risk-engine/`) that computes a
deterministic, explainable risk score (0–100) and tier from an `action`/`resource` pair — see
`docs/risk-engine.md` for the scoring design. The Spring Boot backend now calls it via
`RiskEngineClient` for every request PolicyEngine has already ALLOWed or REVIEWed; see
[Risk Engine Integration](#risk-engine-integration) below. No ML or trajectory/behavioral
analysis is implemented in either service.

### Frontend (Next.js) — planned

### PostgreSQL Database

Stores agents, tools, permission grants and audit logs. The schema is owned by **Flyway**
migrations in `backend/src/main/resources/db/migration`; Hibernate runs with
`ddl-auto=validate` and never changes the schema (see [Database Migrations](#database-migrations-flyway)).

---

## Agent Identity

An **Agent** is an AI agent registered with AgentShield.

| Field | Notes |
|-------|-------|
| `id` | UUID, generated |
| `name` | Unique, `^[a-z0-9][a-z0-9._-]{1,99}$` (lowercase only, so look-alike duplicates such as `Agent` / `agent` cannot coexist) |
| `description` | Optional, ≤ 1000 chars |
| `status` | `ACTIVE` · `SUSPENDED` · `REVOKED` |
| `createdAt` / `updatedAt` | Set automatically |

- Only `ACTIVE` agents can be authorized.
- `SUSPENDED` is reversible (`SUSPENDED → ACTIVE`).
- `REVOKED` is **terminal** — a revoked identity can never be re-activated or suspended (HTTP 409), and cannot receive new permission grants.
- Each agent has at most one active API key. Only its HMAC hash and a non-secret display prefix are stored (see [Authentication](#authentication)).

In gateway requests, `agentId` may be either the agent's **UUID** or its unique **name**, and must identify the agent that owns the API key.

---

## Authentication

### Agent API keys

| Property | Design |
|----------|--------|
| Format | `agk_live_` + 32 base62 characters from `SecureRandom` (~190 bits of entropy) |
| Issued | On `POST /api/v1/agents` and `POST /api/v1/agents/{id}/rotate-key` — returned **once**, with `Cache-Control: no-store` |
| Stored | `agents.api_key_hash` = hex `HMAC-SHA256(pepper, key)` (unique, indexed) and `agents.api_key_prefix` (e.g. `agk_live_abcd`). The plaintext is never stored or logged. |
| Presented | `X-Agent-API-Key: <key>` or `Authorization: Bearer <key>` (both at once with different values → 401) |
| Rotation | Issues a new key; the old hash is overwritten, so the old key fails immediately |
| Revocation | Setting status `REVOKED` deletes the hash — the key stops working immediately and can never be restored |

**Why HMAC-SHA256 with a pepper rather than BCrypt/Argon2 or a per-row salt?** Slow password
hashes exist to protect *low-entropy* human passwords; a 190-bit random key cannot be
brute-forced either way. A deterministic keyed hash allows an indexed lookup by hash (no need
to scan and bcrypt-compare every agent), and the pepper — held only in the application
environment — means a leaked database dump alone cannot be used to verify candidate keys.

### Agent status and authentication

| Agent status | Authenticates? | Result |
|--------------|----------------|--------|
| `ACTIVE` | yes | continues to PermissionEngine |
| `SUSPENDED` | yes | audited **DENY** `AGENT_SUSPENDED` (temporary, reversible — the credential is kept) |
| `REVOKED` | **no** (hash deleted) | **HTTP 401** |

### Admin API key

`/api/v1/agents/**`, `/api/v1/tools/**`, `/api/v1/permissions/**`, `/api/v1/reviews/**` and
`/api/v1/audit/**` require `X-Admin-API-Key`. The configured key is compared as a SHA-256
digest with `MessageDigest.isEqual` (constant time, length-independent). Agent keys are never
accepted on admin endpoints, and the admin key is never accepted on the gateway.

### Security filter chains

| Order | Paths | Credential | Role |
|-------|-------|-----------|------|
| 1 | `/api/v1/gateway/**` | agent API key | `ROLE_AGENT` |
| 2 | `/api/v1/agents/**`, `/api/v1/tools/**`, `/api/v1/permissions/**`, `/api/v1/reviews/**`, `/api/v1/audit/**` | admin API key | `ROLE_ADMIN` |
| 3 | `/actuator/health`, `/actuator/info`, `/error` | none | public |
| 3 | everything else | — | denied |

All chains are stateless (no sessions or cookies), so CSRF protection is disabled. HTTP Basic,
form login and Spring's generated default user are disabled. 401 responses use the standard
`ErrorResponse` JSON body with a `WWW-Authenticate` header and the same message for missing,
malformed and unknown keys.

### Required secrets

| Environment variable | Purpose |
|----------------------|---------|
| `AGENTSHIELD_API_KEY_PEPPER` | HMAC key for agent API key hashes (≥ 32 chars). **Changing it invalidates every agent key** — rotate all keys afterwards. |
| `AGENTSHIELD_ADMIN_API_KEY` | Admin API key (≥ 32 chars) |

The application **refuses to start** if either is missing or shorter than 32 characters; the
error message never contains the configured value. Generate values with `openssl rand -base64 48`.

## Tool Registry

A **Tool** is something an agent can invoke (e.g. `filesystem`, `database`, `github`, `http-client`, `cloud-storage`).

| Field | Notes |
|-------|-------|
| `id` | UUID |
| `name` | Unique, same naming rule as agents; referenced by `tool` in gateway requests |
| `description` | Optional |
| `toolType` | `FILESYSTEM` · `DATABASE` · `SOURCE_CONTROL` · `HTTP` · `CLOUD_STORAGE` · `SHELL` · `OTHER` |
| `status` | `ACTIVE` · `DISABLED` |

A `DISABLED` tool denies every request regardless of permissions.

## Permission Model

An **AgentToolPermission** is an explicit grant: *agent X may perform actions {A, B} using tool Y.*

- At most **one grant per (agent, tool)** pair (unique constraint).
- `allowedActions` is a set of `ActionType` values stored relationally (one row per action), not as a JSON blob — it is queryable, constraint-checked and indexable.
- `enabled = false` switches a grant off without deleting it.
- A grant on one tool never implies anything about another tool.

### Database Relationships

```
┌──────────────┐        ┌──────────────────────────────┐        ┌──────────────┐
│    agents    │ 1    N │    agent_tool_permissions    │ N    1 │    tools     │
│──────────────│────────│──────────────────────────────│────────│──────────────│
│ id (PK)      │        │ id (PK)                      │        │ id (PK)      │
│ name (UQ)    │        │ agent_id (FK → agents.id)    │        │ name (UQ)    │
│ description  │        │ tool_id  (FK → tools.id)     │        │ description  │
│ status       │        │ enabled                      │        │ tool_type    │
│ created_at   │        │ created_at / updated_at      │        │ status       │
│ updated_at   │        │ UQ (agent_id, tool_id)       │        │ created_at   │
└──────────────┘        └──────────────┬───────────────┘        │ updated_at   │
                                       │ 1                      └──────────────┘
                                       │ N
                        ┌──────────────┴───────────────┐
                        │ agent_tool_permission_actions│
                        │──────────────────────────────│
                        │ permission_id (FK)           │
                        │ action  (READ | WRITE | …)   │
                        └──────────────────────────────┘

agents also holds api_key_hash (unique, nullable) and api_key_prefix (added in V2).

audit_logs  — existing table, extended with nullable columns:
              registered_agent_id, registered_tool_id, authorization_result, authorization_reason
```

---

## Authorization Flow & Decision Hierarchy

Authentication happens first, in the Spring Security filter. Authorization is then performed by the deterministic `PermissionEngine` for the **authenticated** agent, **outside the AI agent**. The LLM never participates in, or can influence, either decision. The first failing check wins:

| # | Check | Result | Gateway decision |
|---|-------|--------|------------------|
| 0 | API key missing, malformed, unknown, rotated-out or revoked | — | **HTTP 401** (request never evaluated) |
| 1 | Authenticated agent no longer exists (defensive) | `AGENT_NOT_FOUND` | **DENY** |
| 1 | Body `agentId` is not the authenticated agent | `AGENT_IDENTITY_MISMATCH` | **DENY** |
| 2 | Agent `SUSPENDED` | `AGENT_SUSPENDED` | **DENY** |
| 2 | Agent `REVOKED` (defensive; revoked keys already fail at step 0) | `AGENT_REVOKED` | **DENY** |
| 3 | Tool not registered | `TOOL_NOT_FOUND` | **DENY** |
| 4 | Tool `DISABLED` | `TOOL_DISABLED` | **DENY** |
| 5 | No grant for (agent, tool) | `UNAUTHORIZED` | **DENY** |
| 6 | Grant disabled | `PERMISSION_DISABLED` | **DENY** |
| 7 | Action not in grant | `UNAUTHORIZED` | **DENY** |
| 8 | All checks pass | `AUTHORIZED` | → continue to PolicyEngine |
| 9 | Policy: dangerous resource/action (secrets, prod DELETE) | `AUTHORIZED` | **DENY** (Risk Engine not consulted) |
| 10 | Policy: potentially risky (non-prod DELETE, EXECUTE, EXTERNAL_REQUEST) | `AUTHORIZED` | **REVIEW** → Risk Engine may escalate to DENY |
| 11 | Otherwise | `AUTHORIZED` | **ALLOW** → Risk Engine may escalate to REVIEW/DENY |
| 12 | Final decision (after risk escalation) is REVIEW | `AUTHORIZED` | A `review_requests` row is created (PENDING) — see [Human Review Workflow](#human-review-workflow) |

Key properties:

- **The PolicyEngine is never consulted for unauthorized requests**, so it cannot override a missing permission. It can only tighten (REVIEW / DENY) what authorization already permitted.
- **The Risk Engine is never consulted after a DENY** (from either PermissionEngine or PolicyEngine) — see [Risk Engine Integration](#risk-engine-integration). It can only escalate an ALLOW or REVIEW, never grant or downgrade.
- **Authorization denials** are returned with `riskScore = 100` and recorded with `resourceSensitivity = CRITICAL` (fail-closed maximum). These values describe the authorization failure; the resource itself was not classified.
- Every response includes `authorizationResult`, and every decision — authorization, policy, or risk-escalated — is written to `audit_logs`.
- **Impersonation is blocked and audited:** an agent that authenticates with its own key but claims another agent's `agentId` gets `AGENT_IDENTITY_MISMATCH`. It can never borrow the other agent's permissions.

## Risk Engine Integration

The Risk Engine (`risk-engine/`, Python/FastAPI) is a **risk signal, not an authorization
authority**. `GatewayService` calls it, via `RiskEngineClient`, only when PolicyEngine has
already returned ALLOW or REVIEW for an authorized request — never for a DENY, since a DENY
is already final and the Risk Engine could not change it anyway.

```
PolicyEngine result (ALLOW or REVIEW)
        │
        ▼
RiskEngineClient.assessRisk(action, resource, resourceSensitivity)
   ├─ success  → RiskAssessment(riskScore, riskTier, factors, reason, engineAvailable=true)
   └─ failure  → RiskAssessment.unavailable(): score=65, tier=HIGH,
                 reason="risk_engine_unavailable", engineAvailable=false
        │            (timeout, connection failure, HTTP error, or an unparsable response —
        │             never thrown as an exception, and never treated as zero risk)
        ▼
DecisionEscalator.combine(existingDecision, riskTier)   — escalate-only:
   existing ALLOW:  LOW/MEDIUM → ALLOW,  HIGH → REVIEW,  CRITICAL → DENY
   existing REVIEW: LOW/MEDIUM → REVIEW, HIGH → REVIEW,  CRITICAL → DENY
   existing DENY:   always → DENY (not reachable here — DENY already short-circuited)
        │
        ▼
final decision ── audited (audit_logs, unchanged schema) ── risk assessment persisted
                                                              (risk_assessments, correlated
                                                               by request_id)
```

- **Escalation only.** `DecisionEscalator` can never turn a DENY into REVIEW/ALLOW, or a REVIEW
  into ALLOW. `EvaluationResponse.riskScore` remains PolicyEngine's own score, unaffected by the
  Risk Engine; the Risk Engine's own score/tier are exposed separately as `riskTier` and
  `riskEngineAvailable` (both `null` when the Risk Engine was not consulted).
- **Fails safe, never open.** `HttpRiskEngineClient` catches every failure mode (timeout,
  connection failure, non-2xx HTTP status, or a response it cannot parse into a valid
  `RiskAssessment`) and returns the approved fallback (`score=65`, `tier=HIGH`,
  `reason="risk_engine_unavailable"`, `engineAvailable=false`) instead of throwing or defaulting
  to "no risk". Combined with an existing ALLOW, this fallback escalates to REVIEW.
- **Timeout is enforced on the wire**, not just configured: `agentshield.risk-engine.timeout-ms`
  (default 300) sets both the connect and read timeout on the underlying
  `SimpleClientHttpRequestFactory`, so a slow or hanging Risk Engine cannot block the gateway
  past that bound. No retries are performed (a retry could multiply the timeout budget).
- **Configuration:** `agentshield.risk-engine.url` (env `RISK_ENGINE_URL`, default
  `http://localhost:8000`) and `agentshield.risk-engine.timeout-ms` (env
  `RISK_ENGINE_TIMEOUT_MS`, default `300`).
- **Persistence:** every Risk Engine consultation (successful or fallback) is persisted to
  `risk_assessments` (id, request_id, risk_score, risk_tier, factors as JSON text, reason,
  engine_available, created_at), correlated with the `audit_logs` row for the same request via
  `request_id`. The factor breakdown lives only here, not duplicated into `audit_logs`.
- **Out of scope for this integration:** ML/anomaly detection, trajectory/session analysis,
  caching, retries, and async processing — all future work, not implemented.

## Human Review Workflow

Phase 3 adds a minimal persistent workflow for the `REVIEW` decisions the gateway already
produces. It is purely downstream of the existing decision: it cannot be reached by, and
cannot influence, an `ALLOW` or `DENY`.

```
GatewayService: final decision (after DecisionEscalator)
        │
   ┌────┼────────────┬─────────────────┐
   │    │            │                 │
 ALLOW  DENY       REVIEW              │
   │    │            │                 │
(unchanged)   ReviewRequestService.createReviewRequest(...)
              → review_requests row, status = PENDING
                      │
      POST /api/v1/reviews/{id}/start   (admin API key)
                      ▼
                  IN_REVIEW
                 ╱         ╲
  POST .../approve       POST .../reject
         ▼                      ▼
     APPROVED                REJECTED        (both terminal — immutable)
```

- **State machine (strict):** `PENDING → IN_REVIEW → APPROVED` or `PENDING → IN_REVIEW → REJECTED`.
  There is no `PENDING → APPROVED/REJECTED` shortcut. `APPROVED` and `REJECTED` are terminal —
  any further transition attempt (including re-`start`) is rejected. Enforced in
  `ReviewRequestService.transition(...)`, throwing `InvalidReviewStateException` (HTTP 400) on
  violation.
- **Creation (gateway-only).** `GatewayService` creates a review request if, and only if, the
  final decision (after `DecisionEscalator`) is `REVIEW` — never for `ALLOW` or `DENY`. There is
  no API to create one directly. Creation is idempotent on `request_id`
  (`review_requests.request_id` is also DB-unique): re-processing the same `request_id` returns
  the existing row rather than creating a duplicate.
- **Security invariant: review can never downgrade a DENY.** The review workflow only ever
  operates on requests that already reached `REVIEW`; `APPROVED`/`REJECTED` are human decisions
  *about* a review item, not an authorization re-evaluation, and nothing in this workflow can
  turn a `DENY` into an `ALLOW` or even touch a `DENY`'d request — `DecisionEscalator`'s DENY
  short-circuit (see [Risk Engine Integration](#risk-engine-integration)) runs entirely before
  this workflow is ever reached.
- **Relationship to `AuditLog` / `RiskAssessment`:** all three are correlated by the same
  `request_id` generated once per gateway evaluation. `audit_logs` records the final decision
  that triggered the review; `risk_assessments` records the Risk Engine's factor breakdown that
  may have driven the escalation; `review_requests` records the human workflow's own lifecycle
  on top of that already-decided `REVIEW`. None of the three duplicates the others' detail.
- **`riskScore`/`riskTier` on `ReviewRequest`** are the Risk Engine's own assessment (the same
  values returned on `EvaluationResponse.riskTier`), not PolicyEngine's static score — so a
  human reviewer sees one internally consistent risk signal, rather than the PolicyEngine/
  Risk-Engine score split that `EvaluationResponse.riskScore` intentionally preserves for API
  backward compatibility (see [Risk Engine Integration](#risk-engine-integration)).
  `originalDecision` is the PolicyEngine decision *before* risk escalation (`ALLOW` or
  `REVIEW` — never `DENY`), so a reviewer can tell at a glance whether this item reached REVIEW
  by direct policy rule or by risk escalation of an otherwise-ALLOWed action.
- **API:** `GET /api/v1/reviews/{id}`, `GET /api/v1/reviews?status=PENDING`,
  `POST /api/v1/reviews/{id}/start`, `POST /api/v1/reviews/{id}/approve`,
  `POST /api/v1/reviews/{id}/reject` — see `docs/api-design.md`. Secured by the existing admin
  API key convention (`ROLE_ADMIN`, same filter chain as `/agents`, `/tools`, `/permissions`) —
  this is an operator action, not an agent action, so no new authentication mechanism was added.
- **`EvaluationResponse.reviewRequestId`** is set only when the final decision is `REVIEW`;
  `null` for `ALLOW`/`DENY`. Additive, backward-compatible field.
- **Out of scope for this workflow:** notifications, a review queue UI/dashboard, reviewer
  identity/RBAC (the existing single shared admin key is reused as-is), SLA/expiry on pending
  reviews, and any automatic action on approval/rejection (e.g. re-invoking the protected tool) —
  all future work, not implemented.

## Audit

Each gateway evaluation writes one `audit_logs` row containing the original request fields (`agentId`, `tool`, `action`, `resource`, …), the final `decision`/`actionOutcome`/`riskScore`/`reason`, and:

| Column | Meaning |
|--------|---------|
| `registered_agent_id` | UUID of the **authenticated** agent. `agent_id` keeps the claimed value from the request body, so impersonation attempts show both. |
| `registered_tool_id` | UUID of the resolved tool (null if unknown or not reached) |
| `authorization_result` | `AuthorizationResult` value |
| `authorization_reason` | Human-readable reason from `PermissionEngine` |

The new columns are nullable, so rows written before Milestone 1B remain valid. No credentials or secrets are stored.

Requests rejected with **401 are not written to `audit_logs`**: they are refused before the request body is parsed or validated, so there is no trustworthy request to record. They are logged at `WARN` by the authentication filters (path, remote address and reason — never the key).

## Audit Read API

Phase 4 exposes the `audit_logs` table written by `AuditService.recordEvaluation` through a
read-only admin API. There is no write endpoint — every row is still created exclusively by
`GatewayService` during gateway evaluation; this phase adds query access only.

```
GET /api/v1/audit/{requestId}   — single-row correlation lookup
GET /api/v1/audit?agentId=&decision=&authorizationResult=&from=&to=&page=&size=
                                 — paginated, filterable list (default order: timestamp DESC)
```

- **`requestId` is the correlation key**, the same UUID generated once per gateway evaluation
  and shared with `risk_assessments` and `review_requests` (see [Risk Engine
  Integration](#risk-engine-integration) and [Human Review Workflow](#human-review-workflow)).
  `GET /api/v1/audit/{requestId}` looks up by this value, not by the row's own `id` — an
  operator investigating a `reviewRequestId` or a `risk_assessments` row can follow the same
  `requestId` straight to its audit record. `AuditRepository.findByRequestId(...)` returns
  `Optional<AuditLog>` (not a list): `AuditService.recordEvaluation` is called exactly once per
  gateway evaluation (see `GatewayService.evaluateRequest`), so at most one row exists per
  `requestId`. An unknown `requestId` is a `404`; a malformed (non-UUID) one is a `400`.
- **Filtering** uses `JpaSpecificationExecutor` (`AuditLogSpecifications`) rather than a
  combinatorial set of derived repository method names, since `agentId`, `decision`,
  `authorizationResult`, and a `from`/`to` timestamp range are all optional and independent —
  each contributes a predicate only when present, composed with `Specification.allOf(...)`.
- **Pagination is mandatory and bounded.** `page` (`>= 0`) and `size` (`1..100`) are validated
  at the controller (`@Validated` + `@Min`/`@Max` on `@RequestParam`); out-of-range values are
  rejected with `400` before reaching the database, rather than being silently clamped.
- **Sort order is fixed, not client-controlled.** The list query always orders by
  `timestamp DESC`; there is no `sort` query parameter. This is deliberate: accepting an
  arbitrary client-supplied sort field would let a caller turn any entity property into a sort
  expression. Operators needing a different order have no override in this phase.
- **Indexing (`V6__add_audit_logs_indexes.sql`):** `audit_logs` previously had no indexes
  beyond its primary key. V6 adds indexes on `request_id` (the correlation lookup), `agent_id`
  (the most common equality filter) and `timestamp` (the default sort column and the
  `from`/`to` range filter). No composite `(decision, timestamp)` index was added — `decision`
  has only 3 possible values, too low a cardinality to usefully narrow a scan beyond what the
  `timestamp` index already provides for the default-sorted query; one can be added later if a
  real workload demonstrates the need.
- **No field redaction needed.** `AuditLogResponse` exposes every persisted `AuditLog` field
  as-is: `AuditService.recordEvaluation` never persists the inbound request's `metadata` map,
  API keys, or any other credential (see [Audit](#audit) above) — only
  `agentId`/`sessionId`/`tool`/`action`/`resource` and the resulting decision are written — so
  there is nothing secret in the entity to filter out of the response.
- **Security:** `/api/v1/audit/**` is on the existing admin filter chain (`ROLE_ADMIN`,
  `X-Admin-API-Key`) — the same convention as `/agents`, `/tools`, `/permissions` and
  `/reviews`. An agent API key, or no key at all, is rejected with `401` before the controller
  runs. This is an operator action, not an agent action, so no new authentication mechanism
  was introduced.
- **API:** see `docs/api-design.md`'s "Audit Log" section for the full request/response shapes.
- **Out of scope for this phase:** a dashboard or any UI, trajectory/behavioral analysis, ML,
  the simulator, and any change to gateway authorization behavior or to the human review
  workflow's own state machine — all untouched by this phase.

---

## Database Migrations (Flyway)

| Version | Script | Change |
|---------|--------|--------|
| V1 | `V1__init_schema.sql` | Baseline schema: `agents`, `tools`, `agent_tool_permissions`, `agent_tool_permission_actions`, `audit_logs`. Mirrors the schema Hibernate previously generated, including enum CHECK constraint names. |
| V2 | `V2__add_agent_api_keys.sql` | `agents.api_key_hash` (unique) and `agents.api_key_prefix` |
| V3 | `V3__add_identity_mismatch_authorization_result.sql` | Adds `AGENT_IDENTITY_MISMATCH` to the `audit_logs.authorization_result` CHECK constraint |
| V4 | `V4__add_risk_assessments.sql` | New `risk_assessments` table (Risk Engine Phase 2 integration): `id`, `request_id`, `risk_score`, `risk_tier`, `factors` (JSON text), `reason`, `engine_available`, `created_at`, plus an index on `request_id` |
| V5 | `V5__add_review_requests.sql` | New `review_requests` table (Human Review Workflow, Phase 3): `id`, `request_id` (unique), `agent_id`, `session_id`, `tool`, `action`, `resource`, `resource_sensitivity`, `risk_score`, `risk_tier`, `original_decision`, `status`, `reason`, `created_at`, `updated_at`, `reviewed_at`, plus indexes on `status` and `created_at` |
| V6 | `V6__add_audit_logs_indexes.sql` | Audit Read API (Phase 4): adds indexes on `audit_logs.request_id`, `audit_logs.agent_id` and `audit_logs.timestamp` — no schema/column changes, `audit_logs` previously had no indexes beyond its primary key |

- `spring.jpa.hibernate.ddl-auto=validate` everywhere, **including tests**: the H2 test database is built by the same migrations, so any drift between entities and SQL fails the build.
- Scripts use portable SQL that runs on both PostgreSQL and H2.
- Enum columns have CHECK constraints. **Adding an enum value requires a new migration** that drops and re-creates the constraint (see V3).
- **Upgrading a database created before Flyway** (by the old `ddl-auto=update`): start once with `SPRING_FLYWAY_BASELINE_ON_MIGRATE=true`. Flyway records the existing schema as V1 and applies V2+. Existing agents have no API key after the upgrade — issue one with `POST /api/v1/agents/{id}/rotate-key`. Without the flag, startup fails with a clear message and changes nothing.

---

## Security Assumptions

- **Least privilege / deny by default** — an agent can do nothing until explicitly granted an action on a tool.
- **Separation of identity and authorization** — `Agent`/`Tool` describe *who/what*; `AgentToolPermission` describes *what is allowed*; `PermissionEngine` decides.
- **Deterministic authorization** — same inputs and same database state always give the same result.
- **Authenticated identity** — the caller is identified by its API key, not by the request body; the body's `agentId` must match the key's owner.
- **Credentials at rest** — only HMAC hashes of agent keys are stored; the pepper and admin key live only in the environment.
- **Transport security is assumed** — API keys are bearer credentials, so AgentShield must be served over TLS (terminated by a reverse proxy or ingress) outside local development.
- **Single admin credential** — one shared admin key with full administrative access (no per-operator identity or RBAC yet).
- Error responses never echo database internals or credentials; reasons contain only registered names.

## Current Limitations

- Failed authentications (401) are logged but not written to `audit_logs`, and there is no rate limiting or lockout (key entropy makes guessing infeasible, but floods are not throttled).
- One shared admin key; no per-admin identity, RBAC or admin action audit trail.
- One active key per agent; rotation has no overlap/grace period, so the agent must switch to the new key immediately.
- Changing the pepper invalidates all agent keys.
- `/actuator/health` is public and shows component details (`show-details=always`).
- Permissions cannot be edited in place; revoke (DELETE) and re-grant to change them.
- Permissions are per (agent, tool, action) — no resource-path scoping yet (e.g. "READ only under `src/`").
- PolicyEngine rules are hard-coded, not data-driven.
- The Risk Engine's own scoring is deterministic/rule-based (Phase 1); it is not a trained
  model, and it has no knowledge of agent history, request frequency, or session/trajectory
  context — each request is scored independently. See `docs/risk-engine.md`.
- No retries or caching around the Risk Engine call; a failure always takes the fallback path
  rather than retrying (a retry could exceed the timeout budget).
- Risk Engine integration runs synchronously in the request path; no async processing or queue.
- The human review workflow (Phase 3) has no notifications, review queue UI, reviewer identity/
  RBAC (it reuses the single shared admin key), SLA/expiry on pending reviews, or automatic
  action on approval/rejection — approving a review records a human decision but does not
  re-invoke the protected tool. See [Human Review Workflow](#human-review-workflow).

## Future Roadmap

1. Audit authentication failures and admin actions; rate limiting on authentication failures.
2. Per-operator admin identities with RBAC (e.g. OIDC for humans), replacing the shared admin key.
3. Key expiry and overlapping rotation (two valid keys during a grace period); optional mTLS for agents.
4. Resource-scoped permissions (path / pattern constraints per grant).
5. Trajectory / session analysis and ML-based anomaly detection as additional, explainable-adjacent
   Risk Engine factors (deterministic Risk Engine gateway integration is implemented — see
   [Risk Engine Integration](#risk-engine-integration)).
6. Review queue UI and the frontend dashboard, built on the Phase 3 `review_requests` data
   (persistent human review workflow — PENDING/IN_REVIEW/APPROVED/REJECTED — is implemented;
   see [Human Review Workflow](#human-review-workflow)); notifications and reviewer RBAC.

---

## Port Assignments

| Service | Port |
|---------|------|
| Backend (Spring Boot) | 8080 |
| Risk Engine (FastAPI) | 8000 |
| Frontend (Next.js) | 3000 |
| PostgreSQL | 5434 (host) → 5432 (container) |

---

## Deployment (Planned)

All services will be orchestrated with Docker Compose for local development.
Each service will have its own `Dockerfile`.
