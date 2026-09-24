# API Design

> **Status:** Implemented (Milestone 1A — Core Gateway)

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

### Audit Log

| Method | Path | Description | Status |
|--------|------|-------------|--------|
| `GET` | `/audit` | List recent audit log entries | 🔲 Planned |
| `GET` | `/audit/{id}` | Get a specific audit entry | 🔲 Planned |

---

## Request Schema

### `POST /gateway/evaluate`

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
  "timestamp": "2026-09-13T22:50:00Z"
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
| `200` | Decision returned successfully |
| `400` | Invalid request body |
| `404` | Resource not found |
| `500` | Internal server error |

---

## Notes

- All timestamps are ISO 8601 UTC.
- `riskScore` is an integer 0–100 (0 = lowest risk, 100 = highest).
- API versioning is via URL path prefix (`/api/v1`).
- Authentication will be added in a later phase.
