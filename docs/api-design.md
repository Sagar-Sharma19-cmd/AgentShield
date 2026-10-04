# API Design

> **Status:** Implemented (1A — Core Gateway, 1B — Agent Identity, Tool Registry & Permissions, 1C — Agent & Admin API Key Authentication)

---

## Base URL

```
http://localhost:8080/api/v1
```

---

## Authentication

| API | Header | Credential |
|-----|--------|------------|
| Gateway (`/gateway/**`) | `X-Agent-API-Key: agk_live_…` **or** `Authorization: Bearer agk_live_…` | The calling agent's own API key |
| Admin (`/agents/**`, `/tools/**`, `/permissions/**`, `/reviews/**`) | `X-Admin-API-Key: …` | Admin key from `AGENTSHIELD_ADMIN_API_KEY` |
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
| `GET` | `/actuator/health` | Health check endpoint (public) | ✅ Implemented |

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
| `POST` | `/reviews/{id}/approve` | `IN_REVIEW → APPROVED` (terminal) | `200` |
| `POST` | `/reviews/{id}/reject` | `IN_REVIEW → REJECTED` (terminal) | `200` |

An invalid transition (e.g. `approve` before `start`, or any transition from `APPROVED`/
`REJECTED`) returns `400`. An unknown `{id}` returns `404`.

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
  "createdAt": "2026-09-13T22:50:00Z",
  "updatedAt": "2026-09-13T22:50:00Z",
  "reviewedAt": null
}
```
`riskScore`/`riskTier` here are the Risk Engine's own assessment (unlike `EvaluationResponse`,
where `riskScore` is PolicyEngine's static score — see the Gateway response notes above).
`originalDecision` is the PolicyEngine decision before risk escalation (`ALLOW` or `REVIEW` —
never `DENY`, since a DENY never reaches the review workflow).

### Audit Log

| Method | Path | Description | Status |
|--------|------|-------------|--------|
| `GET` | `/audit` | List recent audit log entries | 🔲 Planned |
| `GET` | `/audit/{id}` | Get a specific audit entry | 🔲 Planned |

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
  }
}
```

`riskScore` is always PolicyEngine's own score (unaffected by the Risk Engine). `riskTier` /
`riskEngineAvailable` describe the separate Risk Engine assessment that may have escalated
`decision` (see `docs/architecture.md`'s "Risk Engine Integration"); both are `null` when the
Risk Engine was not consulted, i.e. whenever `decision` was already DENY before it could run.
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
| `401` | Missing, malformed, unknown, rotated-out or revoked API key; wrong admin key; unmapped path |
| `404` | Agent, tool or permission not found (admin APIs) |
| `409` | Duplicate name / grant, invalid status transition, or key rotation for a revoked agent |
| `500` | Internal server error |

---

## Notes

- All timestamps are ISO 8601 UTC.
- `riskScore` is an integer 0–100 (0 = lowest risk, 100 = highest).
- API versioning is via URL path prefix (`/api/v1`).
- API keys are bearer credentials: serve AgentShield over TLS outside local development.
