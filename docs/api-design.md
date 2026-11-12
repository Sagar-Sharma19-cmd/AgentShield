# API Design

> **Status:** Implemented (1A — Core Gateway, 1B — Agent Identity, Tool Registry & Permissions, 1C — Agent & Admin API Key Authentication, Phase 2 — Risk Engine Gateway Integration, Phase 3 — Human Review Workflow, Phase 4 — Audit Read API)

---

## Base URL

```
http://localhost:8081/api/v1
```

---

## Authentication

| API | Header | Credential |
|-----|--------|------------|
| Gateway (`/gateway/**`) | `X-Agent-API-Key: agk_live_…` **or** `Authorization: Bearer agk_live_…` | The calling agent's own API key |
| Admin (`/agents/**`, `/tools/**`, `/permissions/**`, `/reviews/**`, `/audit/**`) | `X-Admin-API-Key: …` | Admin key from `AGENTSHIELD_ADMIN_API_KEY` |
| `/actuator/health`, `/actuator/info` | none | public |

Any other path is denied. Agent keys never work on admin APIs and the admin key never works on the gateway.

**`401 Unauthorized`** — returned for a missing, malformed, unknown, rotated-out or revoked key (same body in every case), with a `WWW-Authenticate` header:

```json
{
  "timestamp": "2026-09-26T10:00:00Z",
  "status": 401,
  "error": "Unauthorized",
  "message": "Missing or invalid API key",
  "fieldErrors": {}
}
```

---

## Endpoints

### Gateway — requires agent API key

| Method | Path | Description | Status |
|--------|------|-------------|--------|
| `POST` | `/gateway/evaluate` | Submit an agent tool request for security evaluation | ✅ Implemented |
| `GET` | `/gateway/reviews/{id}` | The calling agent's own review request (B3) | ✅ Implemented |
| `POST` | `/gateway/reviews/{id}/claim` | Claim an approved review once and receive the exact approved operation (B3) | ✅ Implemented |
| `POST` | `/gateway/decisions/redeem` | Redeem a signed one-time decision token before running the operation (E1) | ✅ Implemented |
| `POST` | `/gateway/inspect` | Inspect tool output for secrets, personal data and prompt injection; returns it redacted (V13) | ✅ Implemented |
| `GET` | `/actuator/health` | Health check endpoint (public) | ✅ Implemented |

### Agent review endpoints — requires agent API key (B3)

These sit under `/gateway/**`, so they use the gateway security chain: the agent API key, `ROLE_AGENT`.
The admin key is rejected here (`401`). Ownership is the **verified** registered agent of the
authenticated key, recorded when the gateway created the review, never the `agentId` in a request body.

| Method | Path | Success | Errors |
|--------|------|---------|--------|
| `GET` | `/gateway/reviews/{id}` | `200` `AgentReviewResponse` | `401` bad/missing/admin key · `404` unknown id **or another agent's review** (same body, so existence is not revealed) |
| `POST` | `/gateway/reviews/{id}/claim` | `200` `ReviewClaimResponse`, exactly once | `401` · `404` as above · `409` not `APPROVED` (`PENDING`, `IN_REVIEW`, `REJECTED`), expired, or already claimed |

**`AgentReviewResponse`:**
```json
{
  "id": "b2c3d4e5-0000-4000-8000-000000000002",
  "requestId": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
  "status": "APPROVED",
  "reviewer": "alice",
  "note": "Staging build cache only.",
  "expiresAt": "2026-11-10T12:30:00Z",
  "expired": false,
  "consumed": false,
  "tool": "filesystem",
  "action": "DELETE",
  "resource": "tmp/build-cache"
}
```

**`ReviewClaimResponse`** (the only operation the claim allows, exactly as approved):
```json
{
  "reviewId": "b2c3d4e5-0000-4000-8000-000000000002",
  "requestId": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
  "sessionId": "sess-12345",
  "tool": "filesystem",
  "action": "DELETE",
  "resource": "tmp/build-cache",
  "reviewer": "alice",
  "consumedAt": "2026-11-10T12:05:00Z",
  "decisionToken": "eyJhbGciOiJIUzI1NiJ9…"
}
```

`decisionToken` (E1) is a signed one-time token for exactly this operation, with source `REVIEW_APPROVED`.
See "Decision tokens" below.

The claim is one conditional update (`... WHERE consumed_at IS NULL AND status = 'APPROVED' AND
expires_at > now`), so two concurrent claims cannot both succeed. A `409` body's `message` says why, for
example `"This approval was already claimed at …. An approval can be used once."` A claim grants no
permission and does not change any later gateway decision. The agent should run the operation only if
`tool`, `action` and `resource` equal what it intended (the simulator fails closed otherwise).

### Decision tokens and redemption (E1) — requires agent API key

An `ALLOW` from `POST /gateway/evaluate` carries a `decisionToken`, and so does a successful review claim.
`DENY` and `REVIEW` responses never carry one (the field is omitted). The token is an HS256 JWT signed with
`AGENTSHIELD_DECISION_TOKEN_SECRET` (at least 32 characters; the backend refuses to start without it). It lives
`AGENTSHIELD_DECISION_TOKEN_TTL_SECONDS` seconds (default 60).

| Claim | Meaning |
|-------|---------|
| `jti` | The gateway `requestId` (the one-time id) |
| `sub` | The verified registered agent id (UUID) of the key that received it |
| `tool`, `action` | The decided operation |
| `res` | SHA-256 hex of the exact resource string (the resource itself is not in the token) |
| `src` | `ALLOW` or `REVIEW_APPROVED` |
| `args` | SHA-256 hex of the canonical JSON of `arguments` (sorted keys). Present only when the request sent arguments (V13) |
| `iat`, `exp` | Issue time and expiry (seconds) |

An enforcing client redeems the token **before** it runs the operation and runs it only on `200`:

`POST /gateway/decisions/redeem`
```json
{ "token": "eyJhbGciOiJIUzI1NiJ9…", "tool": "docker", "action": "WRITE", "resource": "image:agentshield-demo" }
```

If the token has an `args` claim, the redeem must send the same `arguments` (compared by canonical hash). Different arguments, or arguments sent for a token issued without them, are a `403`.

| Status | When |
|--------|------|
| `200` | `{"requestId": "…", "redeemedAt": "…"}`. The token was valid and is now spent |
| `400` | Malformed body, missing field or oversize value |
| `401` | Missing, bad or admin API key; or the token is not valid (bad signature, wrong algorithm, malformed) or has expired |
| `403` | Token issued to another agent; the agent is no longer `ACTIVE`; or the tool, action or resource differ from the token |
| `409` | The token was already redeemed (one row per `jti` in `decision_redemptions`, a primary-key insert, so concurrent redeems have exactly one winner) |

Redemption grants no permission and changes no gateway decision. The token is never logged; logs carry only
the request id, source and agent id.

### Agents — requires admin API key

| Method | Path | Description | Success |
|--------|------|-------------|---------|
| `POST` | `/agents` | Register an agent (created `ACTIVE`); returns its API key **once** | `201` |
| `GET` | `/agents` | List agents | `200` |
| `GET` | `/agents/{id}` | Get an agent | `200` |
| `PATCH` | `/agents/{id}/status` | Change status (`ACTIVE` / `SUSPENDED` / `REVOKED`; `REVOKED` is terminal and destroys the API key) | `200` |
| `POST` | `/agents/{id}/rotate-key` | Issue a new API key (returned **once**); the old key stops working immediately. `409` for revoked agents | `200` |

### Tools — requires admin API key

| Method | Path | Description | Success |
|--------|------|-------------|---------|
| `POST` | `/tools` | Register a tool (created `ACTIVE`) | `201` |
| `GET` | `/tools` | List tools | `200` |
| `GET` | `/tools/{id}` | Get a tool | `200` |
| `PATCH` | `/tools/{id}/status` | Change status (`ACTIVE` / `DISABLED`) | `200` |

### Permissions — requires admin API key

| Method | Path | Description | Success |
|--------|------|-------------|---------|
| `POST` | `/permissions` | Grant an agent a set of actions on a tool | `201` |
| `GET` | `/permissions/agent/{agentId}` | List an agent's grants | `200` |
| `DELETE` | `/permissions/{id}` | Revoke a grant | `204` |

### Reviews — requires admin API key

Human review workflow for gateway requests whose final decision is `REVIEW` (Phase 3). There is
no endpoint to create a review request directly — it is created only by `GatewayService`. See
`docs/architecture.md`'s "Human Review Workflow" for the full state machine and security
invariants.

| Method | Path | Description | Success |
|--------|------|-------------|---------|
| `GET` | `/reviews/{id}` | Get a review request | `200` |
| `GET` | `/reviews?status=PENDING` | List review requests by status (`status` required: `PENDING`, `IN_REVIEW`, `APPROVED`, `REJECTED`) | `200` |
| `POST` | `/reviews/{id}/start` | `PENDING → IN_REVIEW` | `200` |
| `POST` | `/reviews/{id}/approve` | `IN_REVIEW → APPROVED` (terminal). Body `{"reviewer": "...", "note": "..."}` | `200` |
| `POST` | `/reviews/{id}/reject` | `IN_REVIEW → REJECTED` (terminal). Body `{"reviewer": "...", "note": "..."}` | `200` |

**Decision bodies (B3).** `reviewer` is required on both: 1–100 characters, trimmed. It is a name the
operator types, not an authenticated identity, because the admin key is shared. `note` is optional on
approve and **required** on reject: 1–1000 characters. A missing or invalid field, or a missing body,
returns `400` with `fieldErrors` (for example `{"reviewer": "reviewer is required"}`).

```json
{ "reviewer": "bob", "note": "This cache is shared with production." }
```

An invalid transition (e.g. `approve` before `start`, or any transition from `APPROVED`/
`REJECTED`) returns `400`. An unknown `{id}` returns `404`. **Start, approve or reject on an expired
review returns `409`** with a message naming the expiry time. A review expires
`agentshield.review.ttl-minutes` (default 30, env `AGENTSHIELD_REVIEW_TTL_MINUTES`) after the gateway
created it.

**Response body (`ReviewRequestResponse`):**
```json
{
  "id": "b2c3d4e5-0000-4000-8000-000000000002",
  "requestId": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
  "agentId": "coding-agent-01",
  "sessionId": "sess-12345",
  "tool": "filesystem",
  "action": "DELETE",
  "resource": "dev/temp-file.log",
  "resourceSensitivity": "SENSITIVE",
  "riskScore": 50,
  "riskTier": "HIGH",
  "originalDecision": "REVIEW",
  "status": "PENDING",
  "reason": "DELETE action on non-production resource requires human review.",
  "trajectoryScore": null,
  "trajectoryTier": null,
  "trajectoryReason": null,
  "createdAt": "2026-09-13T22:50:00Z",
  "updatedAt": "2026-09-13T22:50:00Z",
  "reviewedAt": null,
  "reviewer": null,
  "note": null,
  "expiresAt": "2026-09-13T23:20:00Z",
  "expired": false,
  "consumedAt": null,
  "escalatedBy": "NONE"
}
```
`reviewer` and `note` are set by approve/reject. `expired` is computed when the response is built.
`consumedAt` is set when the owning agent claims the approval (B3).
`escalatedBy` is the signal that sent the request to review, the same value as the audit row's
`escalatedBy` (V11): `NONE` (policy held it), `RISK_ENGINE` or `TRAJECTORY`. It is `null` only on reviews
created before V11 whose audit row had no attribution (not recorded, which is not the same as `NONE`).
`riskScore`/`riskTier` here are the **effective** values: the higher of the Risk Engine assessment and
the trajectory assessment (unlike `EvaluationResponse`, where `riskScore` is PolicyEngine's static score
— see the Gateway response notes above). `trajectoryScore`, `trajectoryTier` and `trajectoryReason` are
the trajectory signal on its own (added in V8). They are `null` when trajectory analysis did not run.
A `null` means "not evaluated", not a score of 0.
`originalDecision` is the PolicyEngine decision before risk escalation (`ALLOW` or `REVIEW` —
never `DENY`, since a DENY never reaches the review workflow).

### Audit Log — requires admin API key

Read-only API over `audit_logs` (Phase 4). There is no write endpoint — every row is created
exclusively by `GatewayService` via `AuditService.recordEvaluation`. See `docs/architecture.md`'s
"Audit Read API" for the full design.

| Method | Path | Description | Success |
|--------|------|-------------|---------|
| `GET` | `/audit/{requestId}` | Get the audit row for a gateway request, by `requestId` (the correlation key shared with `risk_assessments` and `review_requests`) | `200` |
| `GET` | `/audit?agentId=&decision=&authorizationResult=&from=&to=&page=&size=` | Paginated, filterable list, default order `timestamp DESC` | `200` |

All list filters are optional and combine with AND: `agentId` (exact match), `decision`
(`ALLOW`/`REVIEW`/`DENY`), `authorizationResult` (see the gateway's `authorizationResult`
values below), `from`/`to` (ISO-8601 instant, inclusive range on `timestamp`). `page` (default
`0`, must be `>= 0`) and `size` (default `20`, must be `1..100`) are validated at the
controller; out-of-range values return `400`. There is no `sort` parameter — sort order is
always `timestamp DESC`, so a caller can never turn an arbitrary entity field into a sort
expression. An unknown `{requestId}` returns `404`; a malformed (non-UUID) `{requestId}`
returns `400`.

**Response body (`GET /audit/{requestId}`, `AuditLogResponse`):**
```json
{
  "id": "d4e5f6a7-0000-4000-8000-000000000003",
  "requestId": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
  "agentId": "coding-agent-01",
  "sessionId": "sess-12345",
  "tool": "filesystem",
  "action": "READ",
  "resource": "src/main/App.java",
  "resourceSensitivity": "INTERNAL",
  "decision": "ALLOW",
  "riskScore": 10,
  "reason": "Action is within permitted policy bounds.",
  "actionOutcome": "ALLOWED",
  "registeredAgentId": "6f1c2d9e-8a4b-4c1e-9f3a-2b7d5e6a1c00",
  "registeredToolId": "0b8e7f6a-1d2c-4e3f-8a9b-7c6d5e4f3a21",
  "authorizationResult": "AUTHORIZED",
  "authorizationReason": "Agent 'coding-agent-01' is permitted to perform READ with tool 'filesystem'.",
  "trajectoryScore": null,
  "trajectoryTier": null,
  "trajectoryReason": null,
  "escalatedBy": "NONE",
  "timestamp": "2026-09-13T22:50:00Z"
}
```

Trajectory fields (V9). `trajectoryScore` (0–100), `trajectoryTier` and `trajectoryReason` are `null` when
trajectory was not evaluated, which covers disabled analysis, skipped DENY decisions and failures. `escalatedBy`
is `NONE`, `RISK_ENGINE` or `TRAJECTORY`, which says which stage changed the decision. It is `null` only on rows
written before V9 ("not recorded", not `NONE`). `TRAJECTORY` means trajectory changed an ALLOW to REVIEW. See
`docs/architecture.md`, Trajectory Analysis.

**Response body (`GET /audit`, `AuditLogPageResponse`):**
```json
{
  "content": [ { "...": "AuditLogResponse, see above" } ],
  "page": 0,
  "size": 20,
  "totalElements": 1,
  "totalPages": 1
}
```

---

## Request Schema

### `POST /gateway/evaluate`

The request is authenticated by its API key, then authorized by the `PermissionEngine` (identity claim → agent status → tool registry → permission grant), and only then evaluated by the `PolicyEngine`. See [architecture.md](architecture.md#authorization-flow--decision-hierarchy) for the full decision hierarchy.

```
POST /api/v1/gateway/evaluate
X-Agent-API-Key: agk_live_…
Content-Type: application/json
```

- `agentId` — the authenticated agent's **name** or **UUID**. A different agent's id → `DENY` / `AGENT_IDENTITY_MISMATCH` (audited).
- `tool` — registered tool **name**

**Request body:**
```json
{
  "agentId": "string (required)",
  "sessionId": "string (required)",
  "action": "READ | WRITE | DELETE | EXECUTE | EXTERNAL_REQUEST (required)",
  "resource": "string (required)",
  "tool": "string (required)",
  "metadata": {
    "key": "value"
  },
  "arguments": "optional (V13): string, array (e.g. argv) or object; at most 64 KB and nesting depth 10"
}
```

**`arguments` and content inspection (V13).** When the request is authorized, the gateway inspects the resource (always,
since V13.1) and `arguments` (when present) before policy. A secret (cloud keys, private keys, tokens, high-entropy
passwords) is a final `DENY` with `escalatedBy = INSPECTION`. Personal data (email, card, PAN, Aadhaar, phone) or
prompt injection raises an `ALLOW` to `REVIEW`. The response then adds `inspectionVerdict` (`CLEAN`, `REVIEW`,
`DENY`) and `inspectionFindings` (a list of `{category, type, location, preview}`; previews are redacted, for
example `AKIA… (20 chars)` or `[EMAIL] (17 chars)`). Argument values are never persisted, logged or echoed back.
Without `arguments`, the resource alone is inspected and the fields are still returned (`CLEAN` and `[]` when
nothing is found). They are omitted only when authorization failed or inspection is disabled. Over the size or depth limit, or a
non-string/array/object value, is a `400`.

### `POST /gateway/inspect` (V13)

```json
{ "sessionId": "string", "tool": "string", "content": "string (at most 262,144 characters)" }
```

The agent is the one the API key belongs to. Returns `{ "requestId": "…", "verdict": "CLEAN | REVIEW | DENY", "findings": [...], "redactedContent": "…" }`, where each finding is
replaced in the content by `[REDACTED:<TYPE>]`. The calling agent must be `ACTIVE` (`403` otherwise). One audit row
is written with action `READ`, resource `output:<tool>` and the verdict as the decision; the content is not stored.

`riskScore` is always PolicyEngine's own score (unaffected by the Risk Engine). `riskTier` /
`riskEngineAvailable` describe the separate Risk Engine assessment that may have escalated
`decision` (see `docs/architecture.md`'s "Risk Engine Integration"); both are `null` when the
Risk Engine was not consulted, i.e. whenever `decision` was already DENY before it could run.
`riskEngineScore` is the Risk Engine's score (`null` when it was not consulted; 65 when it was
unavailable and the gateway failed safe). `trajectoryScore` is the session-history score (`null`
when trajectory was not evaluated). `effectiveRiskScore` is the highest of `riskScore`,
`riskEngineScore` and `trajectoryScore`: the number to show next to the final decision.
`reviewRequestId` is set only when the final `decision` is `REVIEW` (Phase 3 human review
workflow — see `docs/architecture.md`'s "Human Review Workflow"); `null` for `ALLOW`/`DENY`.

**Response body (ALLOW):**
```json
{
  "requestId": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
  "agentId": "coding-agent-01",
  "sessionId": "sess-12345",
  "action": "READ",
  "resource": "src/main/App.java",
  "decision": "ALLOW",
  "reason": "Action is within permitted policy bounds.",
  "riskScore": 10,
  "authorizationResult": "AUTHORIZED",
  "riskTier": "LOW",
  "riskEngineAvailable": true,
  "reviewRequestId": null,
  "timestamp": "2026-09-13T22:50:00Z"
}
```

**Response body (DENY — by policy, Risk Engine not consulted):**
```json
{
  "requestId": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
  "agentId": "coding-agent-01",
  "sessionId": "sess-12345",
  "action": "READ",
  "resource": ".env",
  "decision": "DENY",
  "reason": "Access to credential or secret resource is denied by policy.",
  "riskScore": 90,
  "authorizationResult": "AUTHORIZED",
  "riskTier": null,
  "riskEngineAvailable": null,
  "reviewRequestId": null,
  "timestamp": "2026-09-13T22:50:00Z"
}
```

**Response body (ALLOW, escalated to REVIEW by the Risk Engine — `riskScore` stays low because it is PolicyEngine's own score, not the Risk Engine's; `reviewRequestId` is now set):**
```json
{
  "requestId": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
  "agentId": "coding-agent-01",
  "sessionId": "sess-12345",
  "action": "WRITE",
  "resource": "src/config/settings.py",
  "decision": "REVIEW",
  "reason": "Action is within permitted policy bounds. Escalated to REVIEW by Risk Engine assessment (HIGH).",
  "riskScore": 20,
  "authorizationResult": "AUTHORIZED",
  "riskTier": "HIGH",
  "riskEngineAvailable": true,
  "reviewRequestId": "b2c3d4e5-0000-4000-8000-000000000002",
  "timestamp": "2026-09-13T22:50:00Z"
}
```
This combination (`riskScore: 20`, `riskTier: "HIGH"`, `decision: "REVIEW"`) is intentional, not a bug:
`riskScore` is always PolicyEngine's own 0-100 score for the resource/action pair, unaffected by
the Risk Engine's escalation; `riskTier` is the *separate* Risk Engine signal that drove the
escalation. Always read `riskTier` (not `riskScore`) to understand why a decision was escalated.

**Trajectory escalation.** `EvaluationResponse` has no trajectory fields. A request that trajectory
analysis escalated from ALLOW to REVIEW shows up as `decision: "REVIEW"`, a `reason` that ends with
`Escalated to REVIEW by trajectory analysis (score N, TIER): <reason>`, and a non-null
`reviewRequestId`. Its `riskScore` and `riskTier` are unchanged. The trajectory score and tier are
visible in the audit record and the review record (see those sections). Trajectory never produces
`DENY`, and a trajectory escalation is never recorded on a request that was already `REVIEW` or `DENY`.

**Response body (REVIEW, escalated to DENY by the Risk Engine):**
```json
{
  "requestId": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
  "agentId": "coding-agent-01",
  "sessionId": "sess-12345",
  "action": "DELETE",
  "resource": "dev/temp-file.log",
  "decision": "DENY",
  "reason": "DELETE action on non-production resource requires human review. Escalated to DENY by Risk Engine assessment (CRITICAL).",
  "riskScore": 60,
  "authorizationResult": "AUTHORIZED",
  "riskTier": "CRITICAL",
  "riskEngineAvailable": true,
  "reviewRequestId": null,
  "timestamp": "2026-09-13T22:50:00Z"
}
```
`reviewRequestId` is `null` here too — the final decision is DENY (CRITICAL risk escalates
`REVIEW` straight to `DENY`, never through the review workflow; see `docs/architecture.md`'s
"Human Review Workflow").

**Response body (DENY — authorization failure, Risk Engine not consulted):**
```json
{
  "requestId": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
  "agentId": "research-agent",
  "sessionId": "sess-12345",
  "action": "WRITE",
  "resource": "src/Main.java",
  "decision": "DENY",
  "reason": "Authorization failed: Agent 'research-agent' is not permitted to perform WRITE with tool 'filesystem'.",
  "riskScore": 100,
  "authorizationResult": "UNAUTHORIZED",
  "riskTier": null,
  "riskEngineAvailable": null,
  "reviewRequestId": null,
  "timestamp": "2026-09-24T10:00:00Z"
}
```

`authorizationResult` values: `AUTHORIZED`, `UNAUTHORIZED`, `AGENT_NOT_FOUND`, `AGENT_SUSPENDED`, `AGENT_REVOKED`, `AGENT_IDENTITY_MISMATCH`, `TOOL_NOT_FOUND`, `TOOL_DISABLED`, `PERMISSION_DISABLED`. Every value except `AUTHORIZED` yields `DENY`.

`decisionToken` (E1): present only when `decision` is `ALLOW`, omitted otherwise. Redeem it with
`POST /gateway/decisions/redeem` before running the operation (see "Decision tokens and redemption").

### `POST /agents`

```json
{ "name": "research-agent", "description": "Reads source code (optional)" }
```

`name` must match `^[a-z0-9][a-z0-9._-]{1,99}$` and be unique (`409` on duplicate).

**Response `201`** (`AgentCreateResponse`, sent with `Cache-Control: no-store`):
```json
{
  "id": "6f1c2d9e-8a4b-4c1e-9f3a-2b7d5e6a1c00",
  "name": "research-agent",
  "description": "Reads source code",
  "status": "ACTIVE",
  "apiKeyPrefix": "agk_live_Xk3q",
  "apiKey": "agk_live_Xk3q<28 more random characters>",
  "createdAt": "2026-09-24T10:00:00Z",
  "updatedAt": "2026-09-24T10:00:00Z"
}
```

> ⚠️ `apiKey` is shown **only in this response**. AgentShield stores only a hash and cannot display it again — store it in the agent's secret manager. If it is lost, rotate it.

`GET /agents` and `GET /agents/{id}` return the same fields **without** `apiKey`; `apiKeyPrefix` identifies which key is current (`null` when the agent has no usable key, e.g. after revocation).

### `POST /agents/{id}/rotate-key`

No body. Returns `200` with the same `AgentCreateResponse` shape containing the **new** `apiKey` (once, `Cache-Control: no-store`). The previous key is rejected with `401` immediately. `404` for an unknown agent, `409` for a revoked agent.

### `PATCH /agents/{id}/status` · `PATCH /tools/{id}/status`

```json
{ "status": "SUSPENDED" }
```

### `POST /tools`

```json
{ "name": "filesystem", "description": "Local project files", "toolType": "FILESYSTEM" }
```

`toolType`: `FILESYSTEM`, `DATABASE`, `SOURCE_CONTROL`, `HTTP`, `CLOUD_STORAGE`, `SHELL`, `OTHER`.

### `POST /permissions`

```json
{
  "agentId": "6f1c2d9e-8a4b-4c1e-9f3a-2b7d5e6a1c00",
  "toolId": "0b8e7f6a-1d2c-4e3f-8a9b-7c6d5e4f3a21",
  "allowedActions": ["READ"],
  "enabled": true
}
```

`enabled` is optional (default `true`). One grant per (agent, tool) — `409` if one already exists; `409` if the agent is revoked.

**Response `201`:**
```json
{
  "id": "c3d4e5f6-0000-4000-8000-000000000001",
  "agentId": "6f1c2d9e-8a4b-4c1e-9f3a-2b7d5e6a1c00",
  "agentName": "research-agent",
  "toolId": "0b8e7f6a-1d2c-4e3f-8a9b-7c6d5e4f3a21",
  "toolName": "filesystem",
  "allowedActions": ["READ"],
  "enabled": true,
  "createdAt": "2026-09-24T10:00:00Z",
  "updatedAt": "2026-09-24T10:00:00Z"
}
```

---

## Risk Engine Endpoint (Internal)

Called by the backend (`com.agentshield.riskengine.HttpRiskEngineClient`), not exposed
directly to agents. Unchanged contract from Phase 1 — see `docs/architecture.md`'s "Risk
Engine Integration" section and `docs/risk-engine.md` for the full design, escalation
semantics, timeout, and fail-safe fallback behavior.

### `POST http://risk-engine:8000/score`

**Request:**
```json
{
  "action": "READ | WRITE | DELETE | EXECUTE | EXTERNAL_REQUEST",
  "resource": "string (required, non-blank)",
  "resource_sensitivity": "PUBLIC | INTERNAL | SENSITIVE | CRITICAL | null (accepted, not yet used in scoring)"
}
```

**Response:**
```json
{
  "risk_score": 42,
  "risk_tier": "MEDIUM",
  "factors": [
    { "name": "ACTION_BASE_RISK", "score": 10, "reason": "WRITE action carries a base risk of 10." }
  ],
  "reason": "MEDIUM risk: ..."
}
```

See `docs/risk-engine.md` for the full deterministic scoring formula, factor
weights, and tier thresholds.

---

## HTTP Status Codes

| Code | Meaning |
|------|---------|
| `200` | Decision / resource returned successfully (a `DENY` decision is still `200`), or key rotated |
| `201` | Agent, tool or permission created |
| `204` | Permission revoked |
| `400` | Invalid request body or malformed path parameter |
| `401` | Missing, malformed, unknown, rotated-out or revoked API key; wrong admin key; unmapped path; invalid or expired decision token |
| `404` | Agent, tool, permission or review not found (admin APIs); on `/gateway/reviews/**` also another agent's review |
| `403` | Decision token redeemed by another agent, by an agent that is not `ACTIVE`, or for a different operation |
| `409` | Duplicate name / grant, invalid status transition, key rotation for a revoked agent, an expired review (start/approve/reject/claim), a claim of a review that is not approved or was already claimed, or a decision token that was already redeemed |
| `500` | Internal server error |

---

## Notes

- All timestamps are ISO 8601 UTC.
- `riskScore` is an integer 0–100 (0 = lowest risk, 100 = highest).
- API versioning is via URL path prefix (`/api/v1`).
- API keys are bearer credentials: serve AgentShield over TLS outside local development.
