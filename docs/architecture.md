# Architecture Overview

> **Status:** Core Security Gateway Implemented (Milestone 1A)

---

## System Overview

AgentShield is a runtime security gateway that intercepts every tool call made by an AI agent and enforces security decisions before the call reaches the target resource.

```
┌─────────────────────┐
│      AI Agent       │
└────────┬────────────┘
         │  Tool/API Request (POST /api/v1/gateway/evaluate)
         ▼
┌─────────────────────────────────────────────────────┐
│              AgentShield Security Gateway            │
│                                                     │
│   ┌─────────────────────┐   ┌───────────────────┐   │
│   │    GatewayService   │──►│   PolicyEngine    │   │
│   └──────────┬──────────┘   │ (Deterministic)   │   │
│              │              └───────────────────┘   │
│              ▼                                      │
│     Decision: ALLOW / REVIEW / DENY                 │
│              │                                      │
│              ▼                                      │
│     ┌─────────────────┐                             │
│     │  Audit Log DB   │ (PostgreSQL)                │
│     └─────────────────┘                             │
└───────────────────────┬─────────────────────────────┘
                        │
                        ▼
             Protected Tool / API / Resource
```

---

## Components

### Backend (Spring Boot 3.5.12, Java 17)

- Exposes REST API `POST /api/v1/gateway/evaluate` for AI agent tool requests.
- Evaluates incoming requests via deterministic `PolicyEngine`.
- Computes baseline risk scores ($0–100$).
- Returns security decisions (`ALLOW` / `REVIEW` / `DENY`) with reasons.
- Persists audit logs to PostgreSQL database via `AuditService` & JPA `AuditRepository`.

**Implemented Packages:**
```
com.agentshield.gateway       — REST Controller & GatewayService orchestration
com.agentshield.policy        — PolicyEngine & deterministic risk baseline
com.agentshield.audit         — AuditLog JPA entity, AuditRepository, AuditService
com.agentshield.model         — ActionType, DecisionType, ResourceSensitivity, ActionOutcome enums
com.agentshield.config        — GlobalExceptionHandler REST validation handling
com.agentshield.dto           — EvaluationRequest, EvaluationResponse, ErrorResponse DTOs
```

### Risk Engine (Python / FastAPI)

- A separate microservice that receives a request payload.
- Computes a risk score (0–100).
- Initially uses rule-based heuristics; later can use ML models.
- Returns the score and contributing factors.

### Frontend (Next.js)

- A dashboard showing live agent requests and decisions.
- Allows operators to view audit logs and manage policies.
- Read-only in the first iteration.

### PostgreSQL Database

- Stores: agent sessions, requests, decisions, policies, audit logs.

---

## Data Flow (Planned)

1. Agent sends a POST request to `POST /api/v1/gateway/evaluate`.
2. Backend validates the request schema.
3. Backend checks policies: is this action permitted for this agent?
4. Backend calls the risk engine: `POST http://risk-engine:8000/score`.
5. Risk engine returns a score.
6. Backend combines policy result and risk score into a decision.
7. Decision is written to the audit log.
8. Decision is returned to the agent.

---

## Port Assignments

| Service | Port |
|---------|------|
| Backend (Spring Boot) | 8080 |
| Risk Engine (FastAPI) | 8000 |
| Frontend (Next.js) | 3000 |
| PostgreSQL | 5432 |

---

## Deployment (Planned)

All services will be orchestrated with Docker Compose for local development.
Each service will have its own `Dockerfile`.
