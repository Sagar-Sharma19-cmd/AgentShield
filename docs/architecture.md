# Architecture Overview

> **Status:** Placeholder — to be filled in during Phase 1–3.

---

## System Overview

AgentShield is a runtime security gateway that intercepts every tool call made by an AI agent and enforces security decisions before the call reaches the target resource.

```
┌─────────────────────┐
│      AI Agent       │
└────────┬────────────┘
         │  Tool/API Request
         ▼
┌─────────────────────────────────────────────────────┐
│              AgentShield Security Gateway            │
│                                                     │
│   ┌───────────────┐   ┌───────────────┐             │
│   │ Policy Engine │   │  Risk Engine  │  (external) │
│   │  (Java/Spring)│   │ (Python/FastAPI)            │
│   └───────────────┘   └───────────────┘             │
│              │                │                     │
│              └────────┬───────┘                     │
│                       ▼                             │
│             Decision: ALLOW / REVIEW / DENY         │
│                       │                             │
│              ┌─────────────────┐                    │
│              │   Audit Logger  │                    │
│              └─────────────────┘                    │
└───────────────────────┬─────────────────────────────┘
                        │
                        ▼
             Protected Tool / API / Resource
```

---

## Components

### Backend (Spring Boot)

- Exposes a REST API that agents call when they want to take an action.
- Evaluates the request against the policy engine.
- Calls the risk engine for a numeric risk score.
- Returns a decision (ALLOW / REVIEW / DENY) with reasoning.
- Persists all decisions to PostgreSQL for audit and analysis.

**Planned packages:**
```
com.agentshield.gateway       — Request routing and main controllers
com.agentshield.policy        — Policy evaluation logic
com.agentshield.audit         — Audit log persistence
com.agentshield.model         — Domain models / entities
com.agentshield.repository    — JPA repositories (database access)
com.agentshield.service       — Business logic layer
com.agentshield.config        — Spring configuration
com.agentshield.dto           — Data Transfer Objects (request/response)
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
