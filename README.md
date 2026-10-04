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
    ├─ Authentication      (WHO is asking? proven by the agent's own API key)
    ├─ Agent Identity      (does the claimed agentId match the key? is it ACTIVE?)
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

Authentication runs first, authorization runs **before** policy, and policy can never grant what authorization denied:

0. Missing / invalid / revoked API key → **HTTP 401**
1. Claimed `agentId` is not the key's owner, or agent suspended → **DENY**
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

Admin APIs need `X-Admin-API-Key`; the gateway needs the agent's own key in `X-Agent-API-Key`
(or `Authorization: Bearer …`). See [Running Locally](#running-locally) for the required secrets.

```bash
ADMIN="X-Admin-API-Key: $AGENTSHIELD_ADMIN_API_KEY"

# 1. Register an agent — the response contains its API key ONCE ("apiKey"); store it securely
curl -s -X POST localhost:8080/api/v1/agents -H "$ADMIN" -H 'Content-Type: application/json' \
     -d '{"name":"research-agent","description":"Reads source code"}'

# 2. Register a tool and grant READ on it (use the ids returned above)
curl -s -X POST localhost:8080/api/v1/tools -H "$ADMIN" -H 'Content-Type: application/json' \
     -d '{"name":"filesystem","toolType":"FILESYSTEM"}'
curl -s -X POST localhost:8080/api/v1/permissions -H "$ADMIN" -H 'Content-Type: application/json' \
     -d '{"agentId":"<agent-id>","toolId":"<tool-id>","allowedActions":["READ"]}'

# 3. The agent evaluates an action with its own key
curl -s -X POST localhost:8080/api/v1/gateway/evaluate \
     -H "X-Agent-API-Key: <agent-api-key>" -H 'Content-Type: application/json' \
     -d '{"agentId":"research-agent","sessionId":"s-1","tool":"filesystem","action":"READ","resource":"src/Main.java"}'

# Lost or leaked key? Issue a new one — the old key stops working immediately
curl -s -X POST localhost:8080/api/v1/agents/<agent-id>/rotate-key -H "$ADMIN"
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
A request without a valid key gets **HTTP 401**, and a request whose `agentId` names a different
agent gets `DENY` / `AGENT_IDENTITY_MISMATCH`.
Full API reference: [`docs/api-design.md`](docs/api-design.md).

---

## Project Status

| Phase | Status | Description |
|-------|--------|-------------|
| Phase 0 | ✅ Complete | Repository structure and documentation foundation |
| Phase 1 | ✅ Complete | Core backend gateway — Spring Boot REST API (`POST /api/v1/gateway/evaluate`) |
| Phase 2 | ✅ Complete | Policy engine — deterministic rule evaluation & baseline risk heuristics |
| Phase 2b | ✅ Complete | Agent identity, tool registry & fine-grained agent-tool permissions (`PermissionEngine`) |
| Phase 2c | ✅ Complete | Agent API key authentication, admin API protection, Flyway database migrations |
| Phase 3 | ✅ Complete | Risk engine — deterministic Python/FastAPI scoring service, integrated into the Spring Boot gateway as an escalation-only risk signal |
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

The backend **refuses to start** without two secrets (each ≥ 32 characters), supplied as environment variables:

| Variable | Purpose |
|----------|---------|
| `AGENTSHIELD_API_KEY_PEPPER` | Server-side key used to HMAC agent API keys before storage. Changing it invalidates all agent keys. |
| `AGENTSHIELD_ADMIN_API_KEY` | Value required in the `X-Admin-API-Key` header for admin APIs |

```bash
# Current: PostgreSQL in Docker + backend via Maven
docker compose up -d postgres

export AGENTSHIELD_API_KEY_PEPPER="$(openssl rand -base64 48)"   # keep stable across restarts
export AGENTSHIELD_ADMIN_API_KEY="$(openssl rand -base64 48)"
cd backend && mvn spring-boot:run      # http://localhost:8080 — Flyway migrates the schema on startup

cd backend && mvn clean test package   # run the test suite (H2 + Flyway, no Docker or secrets needed)
```

**Upgrading a database created before Flyway** (by an earlier version of this project): start once with
`SPRING_FLYWAY_BASELINE_ON_MIGRATE=true`. Existing data is kept; existing agents have no API key
until you call `POST /api/v1/agents/{id}/rotate-key`. See [Database Migrations](docs/architecture.md#database-migrations-flyway).

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
10. **Authenticated identity, hashed credentials** — every agent proves who it is with its own API key; only HMAC hashes are stored, and keys are never logged.

> **Current limitations:** a single shared admin key (no per-operator RBAC yet), and failed authentications are logged but not written to the audit table. Serve AgentShield over TLS outside local development — API keys are bearer credentials.

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

