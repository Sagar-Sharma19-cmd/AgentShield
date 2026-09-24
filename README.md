# AgentShield

> **Runtime Security Gateway for AI Agents**

AgentShield is a security layer that sits between an AI agent and the tools or APIs it is allowed to use. Every tool request made by an agent must pass through AgentShield before it reaches the protected resource. The gateway evaluates the request against policies, assesses its risk, and either allows, queues for review, or denies the action.

---

## The Problem

Modern AI agents can call external tools — read files, write to databases, execute code, call APIs, access cloud resources. These agents act autonomously and can make mistakes or be manipulated into performing unsafe operations. There is currently no standard runtime security layer that enforces rules on *what an agent may do* while it is running.

---

## The Solution

```
AI Agent
    │
    ▼
AgentShield Security Gateway
    │
    ├─ Agent Identity      (WHO is asking? registered and ACTIVE?)
    ├─ Tool Registry       (WHAT tool? registered and ACTIVE?)
    ├─ Permission Engine   (is this agent explicitly allowed this action on this tool?)
    ├─ Policy Evaluation   (is this resource/action dangerous?)
    ├─ Risk Evaluation     (how dangerous is this action?)            [planned]
    └─ Behaviour Analysis  (does this fit the agent's normal pattern?) [planned]
    │
    ▼
 ALLOW / REVIEW / DENY  ──►  Audit log (PostgreSQL)
    │
    ▼
Protected Tool / API / Resource
```

The agent never talks to protected tools directly. Every request goes through the gateway.

### Decision hierarchy

Authorization always runs **before** policy, and policy can never grant what authorization denied:

1. Agent missing / suspended / revoked → **DENY**
2. Tool missing / disabled → **DENY**
3. No enabled permission grant covering the action → **DENY**
4. Authorized → PolicyEngine:
   - dangerous resource/action (secrets, production DELETE) → **DENY**
   - potentially risky (non-production DELETE, EXECUTE, external requests) → **REVIEW**
   - otherwise → **ALLOW**

Every decision is audited with the agent, tool, authorization result and reason.
See [`docs/architecture.md`](docs/architecture.md) for the full model.

---

## Architecture (Planned)

| Component | Technology | Responsibility |
|-----------|-----------|----------------|
| `backend` | Java 17, Spring Boot 3, Maven | Core security gateway — policy engine, request routing, audit logging |
| `frontend` | Next.js 14, TypeScript | Dashboard — live request monitoring, policy management, audit trail |
| `risk-engine` | Python 3.11, FastAPI, scikit-learn | Risk scoring service — analyses request metadata and assigns a numeric risk score |
| `simulator` | Python | Simulates AI-agent tool requests for testing and demonstration |
| `docs` | Markdown | Architecture, threat model, API design, and research notes |
| `tests` | JUnit, pytest, REST-Assured | Backend unit/integration tests and risk-engine tests |

All components run locally via **Docker Compose**.

---

## Quick Start: Register an Agent and Evaluate a Request

```bash
# 1. Register an agent and a tool
curl -s -X POST localhost:8080/api/v1/agents -H 'Content-Type: application/json' \
     -d '{"name":"research-agent","description":"Reads source code"}'
curl -s -X POST localhost:8080/api/v1/tools  -H 'Content-Type: application/json' \
     -d '{"name":"filesystem","toolType":"FILESYSTEM"}'

# 2. Grant READ on filesystem (use the ids returned above)
curl -s -X POST localhost:8080/api/v1/permissions -H 'Content-Type: application/json' \
     -d '{"agentId":"<agent-id>","toolId":"<tool-id>","allowedActions":["READ"]}'

# 3. Evaluate an agent action
curl -s -X POST localhost:8080/api/v1/gateway/evaluate -H 'Content-Type: application/json' \
     -d '{"agentId":"research-agent","sessionId":"s-1","tool":"filesystem","action":"READ","resource":"src/Main.java"}'
```

```json
{
  "decision": "ALLOW",
  "authorizationResult": "AUTHORIZED",
  "riskScore": 10,
  "reason": "Action is within permitted policy bounds."
}
```

The same agent attempting `WRITE` returns `DENY` / `UNAUTHORIZED`, because `WRITE` was never granted.
Full API reference: [`docs/api-design.md`](docs/api-design.md).

---

## Project Status

| Phase | Status | Description |
|-------|--------|-------------|
| Phase 0 | ✅ Complete | Repository structure and documentation foundation |
| Phase 1 | ✅ Complete | Core backend gateway — Spring Boot REST API (`POST /api/v1/gateway/evaluate`) |
| Phase 2 | ✅ Complete | Policy engine — deterministic rule evaluation & baseline risk heuristics |
| Phase 2b | ✅ Complete | Agent identity, tool registry & fine-grained agent-tool permissions (`PermissionEngine`) |
| Phase 3 | 🔲 Planned | Risk engine — Python/FastAPI scoring service |
| Phase 4 | 🔲 Planned | Frontend dashboard — Next.js monitoring UI |
| Phase 5 | 🔲 Planned | Agent simulator — test harness for end-to-end scenarios |
| Phase 6 | 🔲 Planned | Behaviour analysis and trajectory evaluation |
| Phase 7 | 🔲 Planned | Full Docker Compose local deployment |

---

## Repository Structure

```
AgentShield/
├── backend/            # Spring Boot security gateway
├── frontend/           # Next.js dashboard
├── risk-engine/        # Python FastAPI risk scoring service
├── simulator/          # AI agent request simulator
├── docs/               # Architecture and design documentation
├── tests/              # Organised test suites
├── docker-compose.yml  # Local multi-service orchestration
├── .gitignore
└── README.md
```

---

## Running Locally

```bash
# Current: PostgreSQL in Docker + backend via Maven
docker compose up -d postgres
cd backend && mvn spring-boot:run      # http://localhost:8080
cd backend && mvn clean test package   # run the test suite (H2, no Docker needed)
```

Planned full stack:

```bash
# Start all services
docker compose up --build

# Backend will be available at:  http://localhost:8080
# Frontend will be available at: http://localhost:3000
# Risk engine will be at:        http://localhost:8000
```

---

## Design Principles

1. **The agent must never access protected tools directly** — all requests go through the gateway.
2. **Modular components** — each service has exactly one responsibility.
3. **Security logic is separate from controllers.**
4. **Database logic is separate from business logic.**
5. **The risk engine is independent from the Java backend** (communicates via REST).
6. **No secrets hard-coded anywhere** — environment variables and `.env` files only.
7. **Simple enough to run on a laptop**, complex enough to demonstrate real security principles.
8. **Least privilege, deny by default** — agents can do nothing until explicitly granted an action on a tool.
9. **Authorization is external and deterministic** — the LLM never decides what it is allowed to do.

> **Current limitation:** agent identity is *self-asserted* in the request body (verified as registered and active, not yet authenticated), and the admin APIs are unauthenticated. Authentication is a planned milestone.

---

## Documentation

- [`docs/architecture.md`](docs/architecture.md) — System architecture overview
- [`docs/threat-model.md`](docs/threat-model.md) — Threat model and attack scenarios
- [`docs/api-design.md`](docs/api-design.md) — REST API contract
- [`docs/risk-engine.md`](docs/risk-engine.md) — Risk scoring design
- [`docs/research-notes.md`](docs/research-notes.md) — Research references and notes

---

## Development Workflow & CI/CD

### Branch Strategy
All development follows a feature-branch workflow off `main`:
- `main`: Production-ready, stable baseline code.
- `feature/*`: Dedicated branches for major functional milestones (e.g. `feature/core-gateway`, `feature/policy-engine`, `feature/risk-engine`).

### Pull Request & CI Workflow
1. Create a feature branch off `main`.
2. Push changes and open a Pull Request (PR) targeting `main`.
3. Automated GitHub Actions run path-filtered CI checks:
   - **Backend CI (`backend-ci.yml`)**: Triggered on `backend/**` changes; runs Java 17 / Maven build and unit tests (`mvn clean test package`).
   - **Risk Engine CI (`risk-engine-ci.yml`)**: Triggered on `risk-engine/**` changes; runs Python 3.11 / Pytest suite (`pytest`).
   - **Security Checks (`security-checks.yml`)**: Runs on all PRs; performs open-source secret scanning and vulnerability checks via Trivy.
4. Merge into `main` after all required status checks pass successfully.

### Future CD Plan
Continuous Deployment (CD) pipelines will be introduced once core gateway and risk engine functionalities stabilize:
- Automated multi-architecture Docker container builds.
- Registry publishing and local/staging deployment orchestration.

---

## Author

Sagar Sharma — Capstone Project, 2026

