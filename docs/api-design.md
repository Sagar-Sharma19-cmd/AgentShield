# API Design

> **Status:** Implemented (Milestone 1A — Core Gateway, Milestone 1B — Agent Identity, Tool Registry & Permissions)

---

## Base URL

```
http://localhost:8080/api/v1
```

---

## Endpoints

### Gateway

| Method | Path | Description | Status |
|--------|------|-------------|--------|
| `POST` | `/gateway/evaluate` | Submit an agent tool request for security evaluation | ✅ Implemented (Milestone 1A) |
| `GET` | `/actuator/health` | Health check endpoint | ✅ Implemented |

### Agents (Milestone 1B)

| Method | Path | Description | Success |
|--------|------|-------------|---------|
| `POST` | `/agents` | Register an agent (created `ACTIVE`) | `201` |
| `GET` | `/agents` | List agents | `200` |
| `GET` | `/agents/{id}` | Get an agent | `200` |
| `PATCH` | `/agents/{id}/status` | Change status (`ACTIVE` / `SUSPENDED` / `REVOKED`; `REVOKED` is terminal) | `200` |

### Tools (Milestone 1B)

| Method | Path | Description | Success |
|--------|------|-------------|---------|
| `POST` | `/tools` | Register a tool (created `ACTIVE`) | `201` |
| `GET` | `/tools` | List tools | `200` |
| `GET` | `/tools/{id}` | Get a tool | `200` |
| `PATCH` | `/tools/{id}/status` | Change status (`ACTIVE` / `DISABLED`) | `200` |

### Permissions (Milestone 1B)

| Method | Path | Description | Success |
|--------|------|-------------|---------|
| `POST` | `/permissions` | Grant an agent a set of actions on a tool | `201` |
| `GET` | `/permissions/agent/{agentId}` | List an agent's grants | `200` |
| `DELETE` | `/permissions/{id}` | Revoke a grant | `204` |

> Administrative APIs are **unauthenticated** in this milestone — local/trusted use only.

### Audit Log

| Method | Path | Description | Status |
|--------|------|-------------|--------|
| `GET` | `/audit` | List recent audit log entries | 🔲 Planned |
| `GET` | `/audit/{id}` | Get a specific audit entry | 🔲 Planned |

---

## Request Schema

### `POST /gateway/evaluate`

The request is first authorized by the `PermissionEngine` (agent identity → tool registry → permission grant) and only then evaluated by the `PolicyEngine`. See [architecture.md](architecture.md#authorization-flow--decision-hierarchy) for the full decision hierarchy.

- `agentId` — registered agent **name** or **UUID**
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
  "timestamp": "2026-09-13T22:50:00Z"
}
```

**Response body (DENY):**
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
  "timestamp": "2026-09-13T22:50:00Z"
}
```

**Response body (REVIEW):**
```json
{
  "requestId": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
  "agentId": "coding-agent-01",
  "sessionId": "sess-12345",
  "action": "DELETE",
  "resource": "dev/temp-file.log",
  "decision": "REVIEW",
  "reason": "DELETE action on non-production resource requires human review.",
  "riskScore": 60,
  "authorizationResult": "AUTHORIZED",
  "timestamp": "2026-09-13T22:50:00Z"
}
```

**Response body (DENY — authorization failure):**
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
  "timestamp": "2026-09-24T10:00:00Z"
}
```

`authorizationResult` values: `AUTHORIZED`, `UNAUTHORIZED`, `AGENT_NOT_FOUND`, `AGENT_SUSPENDED`, `AGENT_REVOKED`, `TOOL_NOT_FOUND`, `TOOL_DISABLED`, `PERMISSION_DISABLED`. Every value except `AUTHORIZED` yields `DENY`.

### `POST /agents`

```json
{ "name": "research-agent", "description": "Reads source code (optional)" }
```

`name` must match `^[a-z0-9][a-z0-9._-]{1,99}$` and be unique (`409` on duplicate).

**Response `201`:**
```json
{
  "id": "6f1c2d9e-8a4b-4c1e-9f3a-2b7d5e6a1c00",
  "name": "research-agent",
  "description": "Reads source code",
  "status": "ACTIVE",
  "createdAt": "2026-09-24T10:00:00Z",
  "updatedAt": "2026-09-24T10:00:00Z"
}
```

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

Called by the backend; not exposed directly to agents.

### `POST http://risk-engine:8000/score`

**Request:**
```json
{
  "agentId": "string",
  "action": "string",
  "resource": "string",
  "metadata": {}
}
```

**Response:**
```json
{
  "riskScore": 42,
  "factors": ["sensitive_resource", "high_frequency_action"]
}
```

---

## HTTP Status Codes

| Code | Meaning |
|------|---------|
| `200` | Decision / resource returned successfully (a `DENY` decision is still `200`) |
| `201` | Agent, tool or permission created |
| `204` | Permission revoked |
| `400` | Invalid request body or malformed path parameter |
| `404` | Agent, tool or permission not found (admin APIs) |
| `409` | Duplicate name / grant, or invalid status transition |
| `500` | Internal server error |

---

## Notes

- All timestamps are ISO 8601 UTC.
- `riskScore` is an integer 0–100 (0 = lowest risk, 100 = highest).
- API versioning is via URL path prefix (`/api/v1`).
- Authentication (gateway callers and admin APIs) will be added in a later phase.
