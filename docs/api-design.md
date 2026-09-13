# API Design

> **Status:** Placeholder — to be finalised during Phase 1 (backend implementation).

---

## Base URL

```
http://localhost:8080/api/v1
```

---

## Endpoints (Planned)

### Gateway

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/gateway/evaluate` | Submit an agent action for security evaluation |
| `GET` | `/gateway/health` | Health check |

### Audit Log

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/audit` | List recent audit log entries |
| `GET` | `/audit/{id}` | Get a specific audit entry |

### Policies (Phase 2)

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/policies` | List all policies |
| `POST` | `/policies` | Create a new policy |
| `PUT` | `/policies/{id}` | Update a policy |
| `DELETE` | `/policies/{id}` | Delete a policy |

---

## Request Schema

### `POST /gateway/evaluate`

**Request body:**
```json
{
  "agentId": "string",
  "sessionId": "string",
  "action": "READ | WRITE | DELETE | EXECUTE | CALL_API",
  "resource": "string",
  "metadata": {
    "key": "value"
  }
}
```

**Response body (ALLOW):**
```json
{
  "requestId": "uuid",
  "decision": "ALLOW",
  "riskScore": 12,
  "reason": "Action is within permitted policy bounds.",
  "timestamp": "2026-01-01T00:00:00Z"
}
```

**Response body (DENY):**
```json
{
  "requestId": "uuid",
  "decision": "DENY",
  "riskScore": 91,
  "reason": "Access to credential files is not permitted.",
  "timestamp": "2026-01-01T00:00:00Z"
}
```

**Response body (REVIEW):**
```json
{
  "requestId": "uuid",
  "decision": "REVIEW",
  "riskScore": 55,
  "reason": "Action requires human review before proceeding.",
  "timestamp": "2026-01-01T00:00:00Z"
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
