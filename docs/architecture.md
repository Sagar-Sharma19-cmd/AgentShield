# Architecture Overview

> **Status:** Core Security Gateway (Milestone 1A) + Agent Identity, Tool Registry & Fine-Grained Permissions (Milestone 1B)

---

## System Overview

AgentShield is a runtime security gateway that intercepts every tool call made by an AI agent and enforces security decisions before the call reaches the target resource.

Milestone 1B changes the question the gateway answers from *"Is this action risky?"* to:

> **WHO** is requesting this action, **WHAT** tool are they using, and **WHAT** is that agent actually allowed to do — and only then, *how risky is it?*

```
┌─────────────────────┐
│  Client / AI Agent  │
└─────────┬───────────┘
          │  POST /api/v1/gateway/evaluate
          ▼
┌───────────────────────────────────────────────────────────────┐
│                  AgentShield Security Gateway                 │
│                                                               │
│  GatewayController ──► GatewayService (orchestration only)    │
│                             │                                 │
│                             ▼                                 │
│   ┌──────────────────── PermissionEngine ─────────────────┐   │
│   │ 1. Agent identity   (registered? ACTIVE?)             │   │
│   │ 2. Tool registry    (registered? ACTIVE?)             │   │
│   │ 3. Permission grant (exists? enabled? action listed?) │   │
│   └──────────┬──────────────────────────────┬─────────────┘   │
│              │ AUTHORIZED                   │ anything else   │
│              ▼                              ▼                 │
│   ┌───────────────────────┐          DENY (risk 100)          │
│   │     PolicyEngine      │               │                   │
│   │ resource/action risk  │               │                   │
│   └──────────┬────────────┘               │                   │
│              ▼                            │                   │
│      ALLOW / REVIEW / DENY                │                   │
│              └──────────────┬─────────────┘                   │
│                             ▼                                 │
│                        AuditService ──► PostgreSQL            │
└─────────────────────────────┬─────────────────────────────────┘
                              ▼
               Protected Tool / API / Resource
```

---

## Components

### Backend (Spring Boot 3.5.12, Java 17)

Layering: **Controller → Service → Engine → Repository**. Controllers contain no business rules;
authorization lives only in `PermissionEngine`; security policy lives only in `PolicyEngine`.

```
com.agentshield.gateway     — GatewayController, GatewayService (orchestrates permission → policy → audit)
com.agentshield.agent       — Agent entity, AgentRepository, AgentService, AgentController
com.agentshield.tool        — Tool entity, ToolRepository, ToolService, ToolController
com.agentshield.permission  — AgentToolPermission entity + repository, PermissionService,
                              PermissionController, PermissionEngine, AuthorizationDecision
com.agentshield.policy      — PolicyEngine & deterministic risk baseline
com.agentshield.audit       — AuditLog entity, AuditRepository, AuditService
com.agentshield.model       — ActionType, DecisionType, ResourceSensitivity, ActionOutcome,
                              AgentStatus, ToolStatus, ToolType, AuthorizationResult enums
com.agentshield.dto         — Request / response DTOs
com.agentshield.exception   — ResourceNotFoundException (404), ConflictException (409)
com.agentshield.config      — GlobalExceptionHandler
```

### Risk Engine (Python / FastAPI) — planned integration

A separate microservice that will compute a risk score (0–100). Not yet called by the backend.

### Frontend (Next.js) — planned

### PostgreSQL Database

Stores agents, tools, permission grants and audit logs.

---

## Agent Identity

An **Agent** is an AI agent registered with AgentShield.

| Field | Notes |
|-------|-------|
| `id` | UUID, generated |
| `name` | Unique, `^[a-z0-9][a-z0-9._-]{1,99}$` (lowercase only, so look-alike duplicates such as `Agent` / `agent` cannot coexist) |
| `description` | Optional, ≤ 1000 chars |
| `status` | `ACTIVE` · `SUSPENDED` · `REVOKED` |
| `createdAt` / `updatedAt` | Set automatically |

- Only `ACTIVE` agents can be authorized.
- `SUSPENDED` is reversible (`SUSPENDED → ACTIVE`).
- `REVOKED` is **terminal** — a revoked identity can never be re-activated or suspended (HTTP 409), and cannot receive new permission grants.
- No API keys, tokens or secrets are stored on the agent.

In gateway requests, `agentId` may be either the agent's **UUID** or its unique **name**.

## Tool Registry

A **Tool** is something an agent can invoke (e.g. `filesystem`, `database`, `github`, `http-client`, `cloud-storage`).

| Field | Notes |
|-------|-------|
| `id` | UUID |
| `name` | Unique, same naming rule as agents; referenced by `tool` in gateway requests |
| `description` | Optional |
| `toolType` | `FILESYSTEM` · `DATABASE` · `SOURCE_CONTROL` · `HTTP` · `CLOUD_STORAGE` · `SHELL` · `OTHER` |
| `status` | `ACTIVE` · `DISABLED` |

A `DISABLED` tool denies every request regardless of permissions.

## Permission Model

An **AgentToolPermission** is an explicit grant: *agent X may perform actions {A, B} using tool Y.*

- At most **one grant per (agent, tool)** pair (unique constraint).
- `allowedActions` is a set of `ActionType` values stored relationally (one row per action), not as a JSON blob — it is queryable, constraint-checked and indexable.
- `enabled = false` switches a grant off without deleting it.
- A grant on one tool never implies anything about another tool.

### Database Relationships

```
┌──────────────┐        ┌──────────────────────────────┐        ┌──────────────┐
│    agents    │ 1    N │    agent_tool_permissions    │ N    1 │    tools     │
│──────────────│────────│──────────────────────────────│────────│──────────────│
│ id (PK)      │        │ id (PK)                      │        │ id (PK)      │
│ name (UQ)    │        │ agent_id (FK → agents.id)    │        │ name (UQ)    │
│ description  │        │ tool_id  (FK → tools.id)     │        │ description  │
│ status       │        │ enabled                      │        │ tool_type    │
│ created_at   │        │ created_at / updated_at      │        │ status       │
│ updated_at   │        │ UQ (agent_id, tool_id)       │        │ created_at   │
└──────────────┘        └──────────────┬───────────────┘        │ updated_at   │
                                       │ 1                      └──────────────┘
                                       │ N
                        ┌──────────────┴───────────────┐
                        │ agent_tool_permission_actions│
                        │──────────────────────────────│
                        │ permission_id (FK)           │
                        │ action  (READ | WRITE | …)   │
                        └──────────────────────────────┘

audit_logs  — existing table, extended with nullable columns:
              registered_agent_id, registered_tool_id, authorization_result, authorization_reason
```

---

## Authorization Flow & Decision Hierarchy

Authorization is performed by the deterministic `PermissionEngine`, **outside the AI agent**. The LLM never participates in, or can influence, the authorization decision. The first failing check wins:

| # | Check | Result | Gateway decision |
|---|-------|--------|------------------|
| 1 | Agent not registered | `AGENT_NOT_FOUND` | **DENY** |
| 2 | Agent `SUSPENDED` | `AGENT_SUSPENDED` | **DENY** |
| 2 | Agent `REVOKED` | `AGENT_REVOKED` | **DENY** |
| 3 | Tool not registered | `TOOL_NOT_FOUND` | **DENY** |
| 4 | Tool `DISABLED` | `TOOL_DISABLED` | **DENY** |
| 5 | No grant for (agent, tool) | `UNAUTHORIZED` | **DENY** |
| 6 | Grant disabled | `PERMISSION_DISABLED` | **DENY** |
| 7 | Action not in grant | `UNAUTHORIZED` | **DENY** |
| 8 | All checks pass | `AUTHORIZED` | → continue to PolicyEngine |
| 9 | Policy: dangerous resource/action (secrets, prod DELETE) | `AUTHORIZED` | **DENY** |
| 10 | Policy: potentially risky (non-prod DELETE, EXECUTE, EXTERNAL_REQUEST) | `AUTHORIZED` | **REVIEW** |
| 11 | Otherwise | `AUTHORIZED` | **ALLOW** |

Key properties:

- **The PolicyEngine is never consulted for unauthorized requests**, so it cannot override a missing permission. It can only tighten (REVIEW / DENY) what authorization already permitted.
- **Authorization denials** are returned with `riskScore = 100` and recorded with `resourceSensitivity = CRITICAL` (fail-closed maximum). These values describe the authorization failure; the resource itself was not classified.
- Every response includes `authorizationResult`, and every decision — authorization or policy — is written to `audit_logs`.

## Audit

Each gateway evaluation writes one `audit_logs` row containing the original request fields (`agentId`, `tool`, `action`, `resource`, …), the final `decision`/`actionOutcome`/`riskScore`/`reason`, and:

| Column | Meaning |
|--------|---------|
| `registered_agent_id` | UUID of the resolved agent (null if the agent is unknown) |
| `registered_tool_id` | UUID of the resolved tool (null if unknown or not reached) |
| `authorization_result` | `AuthorizationResult` value |
| `authorization_reason` | Human-readable reason from `PermissionEngine` |

The new columns are nullable, so rows written before Milestone 1B remain valid. No credentials or secrets are stored.

---

## Security Assumptions

- **Least privilege / deny by default** — an agent can do nothing until explicitly granted an action on a tool.
- **Separation of identity and authorization** — `Agent`/`Tool` describe *who/what*; `AgentToolPermission` describes *what is allowed*; `PermissionEngine` decides.
- **Deterministic authorization** — same inputs and same database state always give the same result.
- **Self-asserted identity (current limitation)** — the gateway trusts the `agentId` in the request body. It verifies that the identity is *registered and active*, but does not yet *authenticate* the caller. Authentication (API keys / mTLS / JWT) is a later milestone.
- **Admin APIs are unauthenticated** in this milestone and must not be exposed outside a trusted local network.
- Error responses never echo database internals; reasons contain only registered names.

## Current Limitations

- No caller authentication on gateway or admin APIs (see above).
- Permissions cannot be edited in place; revoke (DELETE) and re-grant to change them.
- Permissions are per (agent, tool, action) — no resource-path scoping yet (e.g. "READ only under `src/`").
- Schema is managed by Hibernate `ddl-auto=update`; no versioned migrations (Flyway/Liquibase) yet.
- PolicyEngine rules are hard-coded, not data-driven.
- The Python risk engine is not yet called by the backend.

## Future Roadmap

1. Agent authentication — hashed API keys or mTLS bound to the registered agent identity.
2. Admin API authentication and RBAC.
3. Resource-scoped permissions (path / pattern constraints per grant).
4. Versioned database migrations (Flyway).
5. Risk-engine integration, trajectory / session analysis, and ML anomaly detection.
6. Review queue for `REVIEW` decisions and the frontend dashboard.

---

## Port Assignments

| Service | Port |
|---------|------|
| Backend (Spring Boot) | 8080 |
| Risk Engine (FastAPI) | 8000 |
| Frontend (Next.js) | 3000 |
| PostgreSQL | 5434 (host) → 5432 (container) |

---

## Deployment (Planned)

All services will be orchestrated with Docker Compose for local development.
Each service will have its own `Dockerfile`.
