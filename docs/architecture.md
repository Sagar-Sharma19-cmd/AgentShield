# Architecture Overview

> **Status:** Core Security Gateway (1A) + Agent Identity, Tool Registry & Permissions (1B) + Agent Authentication, Admin API Security & Flyway Migrations (1C)

---

## System Overview

AgentShield is a runtime security gateway that intercepts every tool call made by an AI agent and enforces security decisions before the call reaches the target resource.

Milestone 1B changes the question the gateway answers from *"Is this action risky?"* to:

> **WHO** is requesting this action, **WHAT** tool are they using, and **WHAT** is that agent actually allowed to do — and only then, *how risky is it?*

Milestone 1C makes the **WHO** verifiable: every gateway request must be authenticated with the agent's own API key, and the administrative APIs require an admin key.

```
┌─────────────────────┐
│  Client / AI Agent  │
└─────────┬───────────┘
          │  POST /api/v1/gateway/evaluate
          │  X-Agent-API-Key: agk_live_…  (or Authorization: Bearer …)
          ▼
┌───────────────────────────────────────────────────────────────┐
│                  AgentShield Security Gateway                 │
│                                                               │
│  AgentApiKeyAuthenticationFilter (Spring Security)            │
│    missing/invalid/revoked key ──► HTTP 401 (not evaluated)   │
│                             │ authenticated agent (principal) │
│                             ▼                                 │
│  GatewayController ──► GatewayService (orchestration only)    │
│                             │                                 │
│                             ▼                                 │
│   ┌──────────────────── PermissionEngine ─────────────────┐   │
│   │ 1. Identity claim   (body agentId == caller?)         │   │
│   │ 2. Agent status     (ACTIVE?)                         │   │
│   │ 3. Tool registry    (registered? ACTIVE?)             │   │
│   │ 4. Permission grant (exists? enabled? action listed?) │   │
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
com.agentshield.security    — SecurityConfig (filter chains), Agent/Admin API key filters,
                              AgentApiKeyAuthenticator, ApiKeyGenerator, ApiKeyHasher, AuthenticatedAgent
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

Stores agents, tools, permission grants and audit logs. The schema is owned by **Flyway**
migrations in `backend/src/main/resources/db/migration`; Hibernate runs with
`ddl-auto=validate` and never changes the schema (see [Database Migrations](#database-migrations-flyway)).

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
- Each agent has at most one active API key. Only its HMAC hash and a non-secret display prefix are stored (see [Authentication](#authentication)).

In gateway requests, `agentId` may be either the agent's **UUID** or its unique **name**, and must identify the agent that owns the API key.

---

## Authentication

### Agent API keys

| Property | Design |
|----------|--------|
| Format | `agk_live_` + 32 base62 characters from `SecureRandom` (~190 bits of entropy) |
| Issued | On `POST /api/v1/agents` and `POST /api/v1/agents/{id}/rotate-key` — returned **once**, with `Cache-Control: no-store` |
| Stored | `agents.api_key_hash` = hex `HMAC-SHA256(pepper, key)` (unique, indexed) and `agents.api_key_prefix` (e.g. `agk_live_abcd`). The plaintext is never stored or logged. |
| Presented | `X-Agent-API-Key: <key>` or `Authorization: Bearer <key>` (both at once with different values → 401) |
| Rotation | Issues a new key; the old hash is overwritten, so the old key fails immediately |
| Revocation | Setting status `REVOKED` deletes the hash — the key stops working immediately and can never be restored |

**Why HMAC-SHA256 with a pepper rather than BCrypt/Argon2 or a per-row salt?** Slow password
hashes exist to protect *low-entropy* human passwords; a 190-bit random key cannot be
brute-forced either way. A deterministic keyed hash allows an indexed lookup by hash (no need
to scan and bcrypt-compare every agent), and the pepper — held only in the application
environment — means a leaked database dump alone cannot be used to verify candidate keys.

### Agent status and authentication

| Agent status | Authenticates? | Result |
|--------------|----------------|--------|
| `ACTIVE` | yes | continues to PermissionEngine |
| `SUSPENDED` | yes | audited **DENY** `AGENT_SUSPENDED` (temporary, reversible — the credential is kept) |
| `REVOKED` | **no** (hash deleted) | **HTTP 401** |

### Admin API key

`/api/v1/agents/**`, `/api/v1/tools/**` and `/api/v1/permissions/**` require
`X-Admin-API-Key`. The configured key is compared as a SHA-256 digest with
`MessageDigest.isEqual` (constant time, length-independent). Agent keys are never accepted on
admin endpoints, and the admin key is never accepted on the gateway.

### Security filter chains

| Order | Paths | Credential | Role |
|-------|-------|-----------|------|
| 1 | `/api/v1/gateway/**` | agent API key | `ROLE_AGENT` |
| 2 | `/api/v1/agents/**`, `/api/v1/tools/**`, `/api/v1/permissions/**` | admin API key | `ROLE_ADMIN` |
| 3 | `/actuator/health`, `/actuator/info`, `/error` | none | public |
| 3 | everything else | — | denied |

All chains are stateless (no sessions or cookies), so CSRF protection is disabled. HTTP Basic,
form login and Spring's generated default user are disabled. 401 responses use the standard
`ErrorResponse` JSON body with a `WWW-Authenticate` header and the same message for missing,
malformed and unknown keys.

### Required secrets

| Environment variable | Purpose |
|----------------------|---------|
| `AGENTSHIELD_API_KEY_PEPPER` | HMAC key for agent API key hashes (≥ 32 chars). **Changing it invalidates every agent key** — rotate all keys afterwards. |
| `AGENTSHIELD_ADMIN_API_KEY` | Admin API key (≥ 32 chars) |

The application **refuses to start** if either is missing or shorter than 32 characters; the
error message never contains the configured value. Generate values with `openssl rand -base64 48`.

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

agents also holds api_key_hash (unique, nullable) and api_key_prefix (added in V2).

audit_logs  — existing table, extended with nullable columns:
              registered_agent_id, registered_tool_id, authorization_result, authorization_reason
```

---

## Authorization Flow & Decision Hierarchy

Authentication happens first, in the Spring Security filter. Authorization is then performed by the deterministic `PermissionEngine` for the **authenticated** agent, **outside the AI agent**. The LLM never participates in, or can influence, either decision. The first failing check wins:

| # | Check | Result | Gateway decision |
|---|-------|--------|------------------|
| 0 | API key missing, malformed, unknown, rotated-out or revoked | — | **HTTP 401** (request never evaluated) |
| 1 | Authenticated agent no longer exists (defensive) | `AGENT_NOT_FOUND` | **DENY** |
| 1 | Body `agentId` is not the authenticated agent | `AGENT_IDENTITY_MISMATCH` | **DENY** |
| 2 | Agent `SUSPENDED` | `AGENT_SUSPENDED` | **DENY** |
| 2 | Agent `REVOKED` (defensive; revoked keys already fail at step 0) | `AGENT_REVOKED` | **DENY** |
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
- **Impersonation is blocked and audited:** an agent that authenticates with its own key but claims another agent's `agentId` gets `AGENT_IDENTITY_MISMATCH`. It can never borrow the other agent's permissions.

## Audit

Each gateway evaluation writes one `audit_logs` row containing the original request fields (`agentId`, `tool`, `action`, `resource`, …), the final `decision`/`actionOutcome`/`riskScore`/`reason`, and:

| Column | Meaning |
|--------|---------|
| `registered_agent_id` | UUID of the **authenticated** agent. `agent_id` keeps the claimed value from the request body, so impersonation attempts show both. |
| `registered_tool_id` | UUID of the resolved tool (null if unknown or not reached) |
| `authorization_result` | `AuthorizationResult` value |
| `authorization_reason` | Human-readable reason from `PermissionEngine` |

The new columns are nullable, so rows written before Milestone 1B remain valid. No credentials or secrets are stored.

Requests rejected with **401 are not written to `audit_logs`**: they are refused before the request body is parsed or validated, so there is no trustworthy request to record. They are logged at `WARN` by the authentication filters (path, remote address and reason — never the key).

---

## Database Migrations (Flyway)

| Version | Script | Change |
|---------|--------|--------|
| V1 | `V1__init_schema.sql` | Baseline schema: `agents`, `tools`, `agent_tool_permissions`, `agent_tool_permission_actions`, `audit_logs`. Mirrors the schema Hibernate previously generated, including enum CHECK constraint names. |
| V2 | `V2__add_agent_api_keys.sql` | `agents.api_key_hash` (unique) and `agents.api_key_prefix` |
| V3 | `V3__add_identity_mismatch_authorization_result.sql` | Adds `AGENT_IDENTITY_MISMATCH` to the `audit_logs.authorization_result` CHECK constraint |

- `spring.jpa.hibernate.ddl-auto=validate` everywhere, **including tests**: the H2 test database is built by the same migrations, so any drift between entities and SQL fails the build.
- Scripts use portable SQL that runs on both PostgreSQL and H2.
- Enum columns have CHECK constraints. **Adding an enum value requires a new migration** that drops and re-creates the constraint (see V3).
- **Upgrading a database created before Flyway** (by the old `ddl-auto=update`): start once with `SPRING_FLYWAY_BASELINE_ON_MIGRATE=true`. Flyway records the existing schema as V1 and applies V2+. Existing agents have no API key after the upgrade — issue one with `POST /api/v1/agents/{id}/rotate-key`. Without the flag, startup fails with a clear message and changes nothing.

---

## Security Assumptions

- **Least privilege / deny by default** — an agent can do nothing until explicitly granted an action on a tool.
- **Separation of identity and authorization** — `Agent`/`Tool` describe *who/what*; `AgentToolPermission` describes *what is allowed*; `PermissionEngine` decides.
- **Deterministic authorization** — same inputs and same database state always give the same result.
- **Authenticated identity** — the caller is identified by its API key, not by the request body; the body's `agentId` must match the key's owner.
- **Credentials at rest** — only HMAC hashes of agent keys are stored; the pepper and admin key live only in the environment.
- **Transport security is assumed** — API keys are bearer credentials, so AgentShield must be served over TLS (terminated by a reverse proxy or ingress) outside local development.
- **Single admin credential** — one shared admin key with full administrative access (no per-operator identity or RBAC yet).
- Error responses never echo database internals or credentials; reasons contain only registered names.

## Current Limitations

- Failed authentications (401) are logged but not written to `audit_logs`, and there is no rate limiting or lockout (key entropy makes guessing infeasible, but floods are not throttled).
- One shared admin key; no per-admin identity, RBAC or admin action audit trail.
- One active key per agent; rotation has no overlap/grace period, so the agent must switch to the new key immediately.
- Changing the pepper invalidates all agent keys.
- `/actuator/health` is public and shows component details (`show-details=always`).
- Permissions cannot be edited in place; revoke (DELETE) and re-grant to change them.
- Permissions are per (agent, tool, action) — no resource-path scoping yet (e.g. "READ only under `src/`").
- PolicyEngine rules are hard-coded, not data-driven.
- The Python risk engine is not yet called by the backend.

## Future Roadmap

1. Audit authentication failures and admin actions; rate limiting on authentication failures.
2. Per-operator admin identities with RBAC (e.g. OIDC for humans), replacing the shared admin key.
3. Key expiry and overlapping rotation (two valid keys during a grace period); optional mTLS for agents.
4. Resource-scoped permissions (path / pattern constraints per grant).
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
