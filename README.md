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
    ├─ Policy Evaluation   (is this action permitted?)
    ├─ Risk Evaluation     (how dangerous is this action?)
    └─ Behaviour Analysis  (does this fit the agent's normal pattern?)
    │
    ▼
 ALLOW / REVIEW / DENY
    │
    ▼
Protected Tool / API / Resource
```

The agent never talks to protected tools directly. Every request goes through the gateway.

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

## Request / Response Format (Planned)

**Incoming request from agent:**
```json
{
  "agentId": "coding-agent-01",
  "sessionId": "sess-abc123",
  "action": "READ",
  "resource": "repository",
  "metadata": {}
}
```

**Gateway decision:**
```json
{
  "decision": "ALLOW",
  "riskScore": 12,
  "reason": "Action is within permitted policy bounds."
}
```

```json
{
  "decision": "DENY",
  "riskScore": 91,
  "reason": "Access to sensitive credential files is not permitted."
}
```

---

## Project Status

| Phase | Status | Description |
|-------|--------|-------------|
| Phase 0 | ✅ Complete | Repository structure and documentation foundation |
| Phase 1 | 🔲 Planned | Core backend gateway — Spring Boot REST API skeleton |
| Phase 2 | 🔲 Planned | Policy engine — rule-based allow/deny decisions |
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

## Running Locally (Once Implemented)

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

