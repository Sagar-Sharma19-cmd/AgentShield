# Resource Impact Analysis and Blast Radius — Design (M3.4)

> **Status: DESIGN ONLY (M3.4 Stage 0).** Nothing in this document is implemented. There is no
> resource inventory table, no relationship table, no `ImpactAnalyzer`, no endpoint and no gateway
> change. The current system is described in `docs/architecture.md`. Any statement in this
> document about "the analyzer" or "the inventory" describes the planned design, not code that
> exists.

---

## 1. Problem and scope

The gateway today decides on the **action** (READ, WRITE, DELETE, EXECUTE, EXTERNAL_REQUEST) and
a **free-text resource string**. It does not know what that resource is connected to. A DELETE on
one table can cascade to dependent tables, and a WRITE to a configuration file can affect every
service that reads it. The Risk Engine and PolicyEngine score the string, not its neighbourhood.

M3.4 adds an explainable, deterministic **resource impact** signal:

- an operator-maintained inventory of resources with a sensitivity and an environment,
- operator-maintained relationships between them,
- a bounded breadth-first analysis that estimates the **blast radius** of an action,
- an escalation-only contribution to the gateway decision.

**Non-goals for M3.4:** machine learning, automatic resource discovery, imports, trajectory or
session analysis, per-resource permissions, and any change that lets impact **grant** access.

### 1.1 Accepted decisions (from review)

These decisions were reviewed and approved. They bind the design below.

| # | Decision |
|---|---|
| D1 | A CRITICAL resource impact escalates a decision to REVIEW. It never escalates directly to DENY in this milestone. |
| D2 | If impact analysis fails: WRITE, DELETE, EXECUTE and EXTERNAL_REQUEST escalate to REVIEW. READ keeps the existing decision and reports impact as unavailable. |
| D3 | Gateway responses never expose resource names. They return counts, sensitivity buckets, score, tier and explainable factors. |
| D4 | Admin-only resource management and admin views may expose resource names. |
| D5 | The inventory is maintained manually through the admin API. Imports are deferred. |
| D6 | `ImpactAnalyzer` uses a bounded breadth-first search with maximum depth 3 and at most 50 visited nodes. |
| D7 | The analyzer is deterministic and explainable. No ML model. |
| D8 | Impact can only escalate a decision. It never grants authorization. |
| D9 | The feature is behind a configuration flag, default OFF, until gateway integration is validated. |
| D10 | With the flag OFF, existing authorization and risk behaviour is unchanged, and existing response bodies are byte-for-byte unchanged. |

---

## 2. Current state (verified, as of this design)

Verified against the source (then on `feature/frontend`, now on `main`):

- `resource` is a required, non-blank string on `EvaluationRequest` (`dto/EvaluationRequest.java`).
  No other validation applies to it.
- The resource is stored raw in `audit_logs.resource` (VARCHAR 1024), `review_requests.resource`
  (VARCHAR 1024) and the Risk Engine request body.
- `PolicyEngine` lowercases the resource and applies substring rules (`policy/PolicyEngine.java`).
- There is no resource table, no owner column and no relationship table in any migration (V1–V6).
- The gateway order is: PermissionEngine → PolicyEngine → RiskEngine (ALLOW/REVIEW only) →
  DecisionEscalator → audit → ReviewRequest (REVIEW only) (`gateway/GatewayService.java`).

---

## 3. Resource canonicalization and validation

### 3.1 Why there is no universal normalizer

Resource identifiers in this project are heterogeneous. Normalizations that are correct for one
kind are wrong for another:

- Path case is significant on most filesystems. URL host case is not.
- `a//b` may be a distinct name. `a/b` may be the same file as `a//b` on POSIX.
- `..` in a URL path resolves per RFC 3986. `..` in a file path is a traversal attempt.
- Percent-encoding in a URL is a representation of the same value. In a file name it may be a
  different name.

A single normalizer that "fixes" all of these would silently rewrite identifiers, and that can
make two different resources match, or make an attacker's string match an inventory entry it
should not match. Therefore M3.4 does **not** introduce a universal path normalizer.

### 3.2 Contract: validate, classify, accept only canonical input

The canonicalization contract is:

1. **Never rewrite.** The canonicalizer never trims, lowercases, decodes, collapses or resolves
   input. It accepts an input only if the input is already in its canonical form, and otherwise
   returns `UNSUPPORTED`.
2. **Classify by syntax, not by caller claim.** The kind is derived from the string:
   - `URL` — begins with `http://` or `https://` (lowercase scheme exactly).
   - `PATH` — contains `/` and does not begin with `/` and is not a URL.
   - `NAME` — contains neither `/` nor `:`. Examples: `.env`, `credentials`.
   - anything else → `UNSUPPORTED`.
3. **Kind-specific rules** (all rules apply to the raw input; any violation means `UNSUPPORTED`):

   | Rule | URL | PATH | NAME |
   |---|---|---|---|
   | Length 1 to 1024 characters (matches `resource` column width) | yes | yes | yes |
   | Printable ASCII 0x21 to 0x7E only (space 0x20 is rejected) | yes | yes | yes |
   | No leading or trailing whitespace | yes | yes | yes |
   | No backslash `\` | yes | yes | yes |
   | No percent sign `%` (no decoding is performed) | yes | yes | yes |
   | No `?` or `#` (query and fragment are not matched) | yes | yes | yes |
   | No `@` (no userinfo) | yes | — | — |
   | Host is lowercase `[a-z0-9.-]+`; no uppercase host | yes | — | — |
   | Default port written explicitly (`:80` for http, `:443` for https) is rejected | yes | — | — |
   | No `:` after the scheme | yes | — | — |
   | Not absolute (no leading `/`), no `~`, no drive letters | — | yes | — |
   | Segments are not empty (no `//`), and no segment is `.` or `..` | URL path segments | yes | — |
   | Characters limited to `[A-Za-z0-9._-]` in each path segment, plus `/` as separator | yes (path only) | yes | yes |
   | Not exactly `.` or `..` | — | — | yes |

   The printable-ASCII rule excludes spaces. A space in a resource name is therefore
   `UNSUPPORTED`, not a canonical form with spaces.

   **URL rules in detail.** The host character set `[a-z0-9.-]` excludes `:`, so any explicit port
   is rejected, including non-default ports such as `https://a.com:8080/x`. Default ports are rejected
   separately (`:80` for http, `:443` for https). The path uses the same character set as PATH, so
   `~`, `+`, `=`, `,`, `;`, `!`, `*`, `'`, `(`, `)` and `$` are not accepted in URL paths in v1. An
   empty path (`https://example.test`) is accepted. A trailing slash produces an empty final segment
   and is therefore `UNSUPPORTED`.

4. **Case sensitivity.** `PATH` and `NAME` comparisons are case-sensitive. `URL` host is lowercase
   by rule, and the path is case-sensitive. There is no case folding.
5. **Matching.** An inventory match is an exact string equality on `(kind, canonical_key)`.
   There is no prefix match, glob match or containment match in M3.4. Hierarchy comes only from
   explicit `CONTAINS` relationships.
6. **Unsupported input is not an error.** An `UNSUPPORTED` resource is not inventoried. The
   request is evaluated by the existing policy and risk path exactly as today. Its impact status is
   `NOT_INVENTORIED` (see section 9 for the disclosure question).
7. **The raw string is never changed.** `audit_logs.resource`, `review_requests.resource` and the
   Risk Engine input keep the raw value. Canonicalization only decides whether the inventory matches.

### 3.3 Admin inventory writes use the same validator

An inventory entry is created with its canonical key. The validator runs on write. A key that is
not canonical is rejected with HTTP 422 and a field error. The API never stores a rewritten key.
The stored `kind` is recomputed from the key, and any caller-supplied kind is rejected if it
differs.

### 3.4 Examples from the repository

These forms appear in the backend tests, the README, the API and risk-engine documentation, and
the simulator plan. The classification below was checked against the contract.

| Example | Found in | Kind | Result |
|---|---|---|---|
| `.env` | PolicyEngine tests, README | NAME | Accepted as a name. Matches inventory only if an entry exists. |
| `src/main/App.java` | backend tests | PATH | Accepted |
| `dev/temp-cache.txt` | backend tests | PATH | Accepted |
| `production/users-table` | backend tests | PATH | Accepted. The `production/` prefix does not make it match anything by itself. |
| `keys/private.key` | backend tests | PATH | Accepted |
| `aws/credentials.xml` | backend tests | PATH | Accepted |
| `https://api.external.com/prod/sync` | backend tests | URL | Accepted |
| `https://example.test` | docs | URL | Accepted (empty path) |
| `/etc/passwd` | not used | — | `UNSUPPORTED` (absolute). Not inventoried in v1. |
| `src/../production/x` | not used | — | `UNSUPPORTED` (`..` segment). Never normalized to `production/x`. |
| `Src/Main.java` vs `src/main.java` | not used | PATH | Two different keys. Case-sensitive. |
| `HTTPS://Api.Example.com/x` | not used | — | `UNSUPPORTED` (uppercase scheme and host). Not rewritten. |

### 3.5 Known gaps in the contract

- Absolute paths and filesystem roots are not supported in v1. This is a limitation, not a claim
  that absolute paths are safe.
- Non-ASCII names and internationalized domain names are not supported in v1.
- Query strings are not supported. Two URLs that differ only in query do not match.
- The contract covers syntax only. It does not establish that two syntactically different
  identifiers refer to different real objects, or the reverse.

---

## 4. Resource inventory model

Planned table `resources` (Flyway V10, not yet written):

| Column | Type (planned) | Notes |
|---|---|---|
| `id` | UUID, PK | |
| `canonical_key` | VARCHAR(1024), NOT NULL | Stored only in canonical form (section 3) |
| `kind` | VARCHAR(10), NOT NULL, CHECK in (`PATH`,`URL`,`NAME`) | Derived from the key, never trusted from the caller |
| `sensitivity` | VARCHAR(20), NOT NULL, CHECK | Reuses `ResourceSensitivity`: PUBLIC, INTERNAL, SENSITIVE, CRITICAL |
| `environment` | VARCHAR(20), NOT NULL, CHECK | PROD, NONPROD, UNKNOWN |
| `owner_label` | VARCHAR(100), nullable | Free text. Must not hold secrets. Not an identity |
| `description` | VARCHAR(1000), nullable | Free text. Must not hold secrets |
| `created_at`, `updated_at` | TIMESTAMP(6) WITH TIME ZONE, NOT NULL | |

Constraints: `UNIQUE (kind, canonical_key)`. Index on `canonical_key` if the unique index does not
already serve lookups.

Sensitivity and environment are set by the operator. They are **not** inferred from the string by
the new feature. The existing substring rules remain the fallback for resources that are not
inventoried.

---

## 5. Resource relationship model

Planned table `resource_relationships` (Flyway V11, not yet written):

| Column | Type (planned) | Notes |
|---|---|---|
| `id` | UUID, PK | |
| `source_resource_id` | UUID, NOT NULL, FK → `resources.id` | |
| `target_resource_id` | UUID, NOT NULL, FK → `resources.id` | |
| `relation_type` | VARCHAR(20), NOT NULL, CHECK in (`CONTAINS`,`DEPENDS_ON`,`REPLICATES_TO`) | |
| `created_at` | TIMESTAMP(6) WITH TIME ZONE, NOT NULL | |

Constraints:
- `UNIQUE (source_resource_id, target_resource_id, relation_type)`.
- `CHECK (source_resource_id <> target_resource_id)`. Self-loops are rejected.
- Indexes on `source_resource_id` and on `target_resource_id`. The BFS queries both directions.

Cycles are allowed in the data and handled by the analyzer's visited set, so the schema does not
forbid them.

**Propagation semantics (proposed; see open question Q4).** Each relation type defines the direction
in which impact spreads:

| Relation | Meaning | Impact spreads from | To |
|---|---|---|---|
| `CONTAINS` | source contains target | source (container) | target (contents) |
| `REPLICATES_TO` | source is copied to target | source | target |
| `DEPENDS_ON` | source depends on target | target (dependency) | source (dependent) |

Propagation is applied only for WRITE and DELETE (section 6.2). READ does not change anything, and
EXECUTE and EXTERNAL_REQUEST are analysed as direct impact only in v1.

---

## 6. ImpactAnalyzer and bounded BFS

### 6.1 Inputs and outputs

- **Input:** the canonical request resource, the action, and the inventory state at request time.
- **Output (internal, never returned to the gateway caller in full):** status, the direct resource,
  the set of affected resource ids with their sensitivity and environment, depth reached, the
  truncation flag, and factors.

### 6.2 Algorithm

```
analyze(startKey, action):
  if no inventory entry matches startKey → NOT_INVENTORIED
  start = matched entry
  direct = scoreDirect(action, start)
  if action ∉ {WRITE, DELETE} → affected = ∅, no traversal
  else:
    visited = {start}; frontier = [start]; depth = 0; truncated = false
    while frontier not empty and depth < MAX_DEPTH (3):
      next = []
      for node in frontier sorted by canonical key:            # deterministic order
        for neighbour in impactTargets(node) sorted by key:    # per section 5 direction
          if neighbour in visited: continue
          if |visited| >= MAX_VISITED (50): truncated = true; stop everything
          visited.add(neighbour); next.add(neighbour)
      frontier = next; depth += 1
    if frontier not empty after depth limit: truncated = true
  return COMPUTED(direct, affected = visited − {start}, depth, truncated)
```

Properties this guarantees:

- Termination: the visited set is bounded by 50, and the depth is bounded by 3.
- Cycles: a node is expanded at most once.
- Determinism: frontier and neighbour order is sorted by canonical key. Truncation therefore
  affects the same nodes on every run.
- Work bound: at most 50 node expansions per request. Edge reads are one query per BFS level, using
  an `IN` list over the frontier, not one query per node.

### 6.3 Budget and time

The node and depth caps are the primary budget. A wall-clock budget is a secondary guard for
database latency. Its value is **experimental** and is not chosen yet (Q7). Exceeding it produces
the failure path in section 8.

---

## 7. Scoring and explainability

### 7.1 Weights are experimental

**Every weight in this section is an experimental, hand-chosen value.** They are not calibrated
against data, not validated, and not derived from a model. No accuracy, precision or recall claim
may be made for them. They must be published as experimental in the API documentation.

### 7.2 Components

Direct impact:

| Term | Values (experimental) |
|---|---|
| Action (direct) | READ 0, WRITE 10, DELETE 20, EXECUTE 10, EXTERNAL_REQUEST 10 |
| Sensitivity of the start resource | PUBLIC 0, INTERNAL 5, SENSITIVE 15, CRITICAL 25 |
| Environment of the start resource | PROD +10, UNKNOWN +5, NONPROD 0 |

Blast radius (WRITE and DELETE only):

| Term | Values (experimental) |
|---|---|
| Per affected node, by sensitivity | PUBLIC 0, INTERNAL 1, SENSITIVE 3, CRITICAL 5 |
| Cap on the blast term | 30 |

Total and tiers:

- `score = min(100, direct + blast)`
- Tiers use the same boundaries as the Risk Engine: LOW ≤ 29, MEDIUM 30–59, HIGH 60–79, CRITICAL ≥ 80.

Maximum direct score is 20 + 25 + 10 = 55. Maximum blast score is 30. The maximum total is 85.

### 7.3 Factors and reasons

Each factor is returned with a name, a score and a reason. Reasons are generated from fixed
templates that include counts only. They never include a resource name, id or key.

Example factor names: `DIRECT_ACTION`, `DIRECT_SENSITIVITY`, `DIRECT_ENVIRONMENT`,
`BLAST_SENSITIVITY`, `BLAST_TRUNCATED`.

Example reason, with counts only: "2 SENSITIVE and 1 CRITICAL resources are reachable within
depth 2 through DEPENDS_ON and CONTAINS edges."

Relation types may appear in reasons because they are a fixed vocabulary, not resource data.

---

## 8. Gateway integration and failure handling

### 8.1 Placement

The impact stage runs only for an authorized request whose policy decision is ALLOW or REVIEW
(the same condition as the Risk Engine). It runs after the existing Risk Engine call, so the
Risk Engine path is not modified. Its result is combined through a separate escalate-only
function, `ImpactEscalator`. `DecisionEscalator` is not changed.

```
PermissionEngine  → DENY: final, impact not called
PolicyEngine      → DENY: final, impact not called
RiskEngine        → unchanged (existing behaviour)
ImpactStage       → flag OFF: skipped entirely
                  → flag ON: canonicalize, lookup, BFS, score
ImpactEscalator   → escalate-only: impact CRITICAL → REVIEW (D1); never DENY
Audit, risk_assessments, impact_assessments
ReviewRequest     → only when the final decision is REVIEW
```

### 8.2 Combination rules

| Current decision | Impact result | Result |
|---|---|---|
| ALLOW | COMPUTED, tier CRITICAL (D1) | REVIEW |
| ALLOW | COMPUTED, tier HIGH, MEDIUM or LOW | ALLOW (see open question Q1 for HIGH) |
| ALLOW | NOT_INVENTORIED | ALLOW (no change) |
| ALLOW | UNAVAILABLE, action WRITE, DELETE, EXECUTE or EXTERNAL_REQUEST (D2) | REVIEW |
| ALLOW | UNAVAILABLE, action READ (D2) | ALLOW, impact reported as unavailable |
| REVIEW | any | REVIEW (never ALLOW, never DENY) |
| DENY | any | DENY (impact not called) |

### 8.3 Failure handling

Failure means: the analyzer throws, a database read fails, or the time budget is exceeded.
Failure never fails open for a write-class action (D2). The failure is recorded as
`status = UNAVAILABLE` in `impact_assessments`, with a reason that contains no resource detail.

`NOT_INVENTORIED` is **not** a failure. An unmatched resource is the normal case for every
resource that has not been entered by an operator. The design deliberately does not treat an
uninventoried WRITE or DELETE as high risk (see open question Q2).

### 8.4 Flag

Configuration key (planned): `agentshield.resource-impact.enabled`, environment variable
`RESOURCE_IMPACT_ENABLED`, default `false`.

When the flag is OFF:
- no canonicalization, lookup, traversal or scoring runs,
- no `impact_assessments` row is written,
- the `resourceImpact` response field is omitted, not null.

---

## 9. API response design

### 9.1 Gateway response (agent caller)

`EvaluationResponse` gains one optional field, `resourceImpact`. It is annotated so that it is
**omitted** when null, which keeps the existing JSON byte-for-byte identical when the flag is OFF
(D10).

```json
"resourceImpact": {
  "status": "COMPUTED",
  "tier": "HIGH",
  "score": 71,
  "affectedCount": 7,
  "affectedBySensitivity": { "PUBLIC": 1, "INTERNAL": 2, "SENSITIVE": 3, "CRITICAL": 1 },
  "affectedByEnvironment": { "PROD": 4, "NONPROD": 2, "UNKNOWN": 1 },
  "depthReached": 2,
  "truncated": false,
  "factors": [
    { "name": "DIRECT_ACTION", "score": 20, "reason": "DELETE is a destructive action." },
    { "name": "DIRECT_SENSITIVITY", "score": 25, "reason": "The requested resource is CRITICAL." },
    { "name": "DIRECT_ENVIRONMENT", "score": 10, "reason": "The requested resource is in production." },
    { "name": "BLAST_SENSITIVITY", "score": 16, "reason": "7 affected resources include 1 CRITICAL and 3 SENSITIVE." }
  ],
  "experimental": true
}
```

Rules for this response:
- It never contains a resource name, a resource id, or a canonical key (D3).
- `status` is one of `COMPUTED`, `UNAVAILABLE` or `NOT_INVENTORIED`. Open question Q3 covers whether
  `NOT_INVENTORIED` should be shown to the agent.
- `experimental: true` is always present while the weights are unvalidated.
- The test suite must check the serialized response for canary names to prove that no name leaks.
- **Membership leakage from aggregate counts (not yet analysed).** D3 allows counts, but a count is
  not always neutral. In a small graph, `affectedBySensitivity.CRITICAL: 1`, or a `BLAST_SENSITIVITY`
  factor whose reason names a count of 1, can show that a specific sensitivity class exists within
  reach of the request. An agent that varies its requests can use this to map which sensitivity
  classes are inventoried. The response also reveals `NOT_INVENTORIED` versus `COMPUTED` for the
  request's own resource (Q3). The design does not yet bound this. Possible mitigations, none
  decided: suppress counts below a threshold, return only tier and score, or show counts to admins
  only. This is recorded as an open risk; Q3 and Q9 remain unresolved.

### 9.2 Admin view (names allowed)

A planned admin endpoint returns the full analysis for one request, including affected resource
names and ids (D4): `GET /api/v1/audit/{requestId}/impact`.

It is placed under `/api/v1/audit/**`, which is already in the admin filter chain
(`security/SecurityConfig.java`). This avoids adding a new matcher for the read path.

### 9.3 Management endpoints (admin, planned)

- `/api/v1/resources` — list, create, update, delete (create and update reject non-canonical keys).
- `/api/v1/resource-relationships` — list, create, delete.

These paths are **not** in the admin filter chain today. Until they are added explicitly, they fall
through to the final `denyAll` rule. That is the intended fail-closed default, and the matcher must
be updated with the endpoints, not before.

---

## 10. Persistence and audit correlation

### 10.1 `impact_assessments` (planned, Flyway V12)

| Column | Type (planned) | Notes |
|---|---|---|
| `id` | UUID, PK | |
| `request_id` | UUID, NOT NULL, UNIQUE | Same correlation key as `audit_logs`, `risk_assessments` and `review_requests` |
| `status` | VARCHAR(20), NOT NULL, CHECK in (`COMPUTED`,`UNAVAILABLE`,`NOT_INVENTORIED`) | |
| `tier` | VARCHAR(20), nullable, CHECK in (`LOW`,`MEDIUM`,`HIGH`,`CRITICAL`) | Null unless COMPUTED |
| `score` | INTEGER, nullable | Null unless COMPUTED |
| `start_resource_id` | UUID, nullable, **no foreign key** | Historical reference. The inventory row may be removed later |
| `affected_resource_ids` | VARCHAR(4000), nullable | JSON array of up to 50 ids. Ids only, no names |
| `affected_count`, `depth_reached` | INTEGER, nullable | |
| `truncated` | BOOLEAN, NOT NULL | |
| `factors` | VARCHAR(4000), nullable | JSON. Factor names, scores and template reasons |
| `reason` | VARCHAR(1000), nullable | Contains no resource detail |
| `created_at` | TIMESTAMP(6) WITH TIME ZONE, NOT NULL | |

The row is written only when the flag is ON, and only for requests that reached the impact stage.

### 10.2 Audit correlation

`audit_logs` is not changed. The impact row is linked by `request_id`, the same way `risk_assessments`
is linked. The admin impact view joins by `request_id`. Names for the admin view are resolved from the
current inventory when the view is read. That means a name can change after the decision was made.
This is a known limitation (section 13).

### 10.3 Retention

M3.4 does not add a retention policy. Impact rows grow with gateway traffic when the flag is ON.
This is listed as a risk (section 13).

---

## 11. Migration plan

| Migration | Content | Dependency |
|---|---|---|
| V10 | `resources` table, its unique constraint and indexes | none |
| V11 | `resource_relationships` table, constraints and indexes | V10 |
| V12 | `impact_assessments` table, constraints and index on `request_id` (unique) | none (no foreign keys) |

> **Renumbering (M4.3).** This plan was originally written as V7–V9. Those numbers are now used by the
> trajectory-analysis migrations (V7 `audit_logs` session/agent index, V8 `review_requests` trajectory
> columns, V9 `audit_logs` trajectory columns and `escalated_by`), so the M3.4 migrations move to V10–V12
> in the same order and with the same dependencies. No table, column, constraint or behaviour changes.
> No M3.4 migration file exists yet; Stage 0 is design only.

Rules for all three:
- Additive only. No existing table is altered. No existing data is changed.
- Portable across PostgreSQL and H2, using VARCHAR columns with CHECK constraints (the repository's
  existing convention), with no JSONB and no recursive SQL.
- `DatabaseMigrationTest` is extended for each version.
- Rollback with the flag OFF is safe, because the new tables are unused. Dropping a table is a
  destructive change and requires explicit confirmation (CLAUDE.md section 35).

---

## 12. Security and performance considerations

**Security**
- Inventory and relationship writes are admin-only, through the admin filter chain (section 9.3).
- Gateway responses never contain resource names (D3). A canary test enforces this.
- The canonicalizer rejects traversal and ambiguous input. An attacker cannot make a string match an
  inventory entry it does not exactly equal.
- **Evasion by alias or unsupported form (security risk, not a theoretical limitation).** The agent
  chooses the resource string, and the check is exact string equality on canonical form (section 3.2).
  The agent can therefore avoid impact escalation in three ways:
  1. **Unsupported form.** Using an absolute path (`/srv/prod/db`), a `..` segment, a `%`-encoded or
     query-bearing form, or a non-ASCII name returns `UNSUPPORTED`. The request is then
     `NOT_INVENTORIED` and receives no impact, even if the same resource is inventoried under its
     canonical name. Absolute-path resources cannot be inventoried at all in v1, so an operator cannot
     protect them with this feature (Q5).
  2. **Alias.** Writing the same object under a different canonical string (`Src/Main.java` for
     `src/main.java`, or a second URL form for the same host) is treated as a different resource.
  3. **Unlisted neighbour.** Impact is only as complete as the curated graph (section 13).
  Each of these reduces escalation only. None grants access (D8), and the existing PolicyEngine and
  authorization checks still apply to the same string. The feature must not be described as
  preventing these evasions. Mitigations (for example, rejecting `NOT_INVENTORIED` for write-class
  actions, which is Q2, or alias registration) are not decided here.
- Impact only escalates. A wrong or missing inventory entry can reduce escalation. It can never
  grant access (D8). The residual risk is an under-reported blast radius, and it is stated as a
  limitation, not hidden.
- Owner and description fields are free text. Operators must not put secrets in them. No automatic
  check exists in v1.
- Admin changes to the inventory are **not audited** today, because there is no admin action audit
  trail (CLAUDE.md, NOT IMPLEMENTED). An inventory change can change future decisions. This is a
  real gap. See open question Q8.

**Performance**
- Per request, when the flag is ON: one lookup by the unique key, up to three edge queries (one per
  BFS level), and one batch read of the affected resources. No per-node queries.
- The node cap of 50 bounds the work regardless of graph size.
- No cache in v1. Caching is added only if measurement shows a need.
- The Risk Engine already consumes a 300 ms budget (`agentshield.risk-engine.timeout-ms`). The impact
  stage has its own budget and must not share it. The exact value is open (Q7).
- Inventory size is not limited in v1. Listing endpoints must be paginated.

---

## 13. Limitations

- **Coverage.** Only inventoried resources get impact. A resource that nobody entered is invisible to
  the feature.
- **Curation.** Relationships are entered by hand. A missing edge understates the blast radius, and
  no automated check detects a missing edge.
- **Matching.** Exact string equality. A resource referred to by two different strings is treated as
  two resources unless both are inventoried. Because the agent controls the string, aliases and
  unsupported forms can evade impact escalation. This is described as a security risk in section 12.
- **Aggregate disclosure.** Counts in the gateway response can reveal inventory membership in small
  graphs (section 9.1). This is not mitigated in v1.
- **Staleness.** Names in the admin view reflect the inventory at read time, not at decision time.
- **Weights.** All weights are experimental and unvalidated. They are not a measure of real risk.
- **Scope.** Impact does not consider the agent's history, its session, or the sequence of its
  requests. Trajectory analysis is a separate stage (M4.3, see `docs/architecture.md`) and is not part of M3.4.
- **Not ML.** Nothing here is a learned model.

---

## 14. Testing strategy

**Canonicalizer (unit, table-driven).** Every rule in section 3.2 has a positive case and a negative
case. Add these inputs explicitly: `../x`, `a/../b`, `a//b`, `a/./b`, `/etc/passwd`, `~/x`, `C:/x`,
`a\b`, `a%2Fb`, `a?b=1`, `a#x`, ` a`, `a `, `a\tb`, `Ä`, `http://A.com/x`, `HTTP://a.com`,
`https://a.com:443/x`, `https://u@a.com/x`, a 1025-character string, `.`, `..`, and the empty string.
Also check that no call path mutates the input (the function returns the same string or
`UNSUPPORTED`).

**Analyzer (unit).** Cycles, self-reference (rejected by the schema, so tested at the service layer),
depth limit at 3, node cap at 50 with `truncated = true`, deterministic order across runs, empty
graph, single node, DEPENDS_ON direction (dependents affected, dependencies not), CONTAINS direction,
REPLICATES_TO direction, and READ and EXECUTE producing no traversal. A synthetic graph of 1000
nodes must finish with at most 50 visited nodes.

**Scoring and escalation (unit).** The table in section 7.2 and the combination table in section 8.2.
Confirm that no combination can produce DENY from REVIEW or ALLOW.

**Gateway (integration).**
- Flag OFF golden test: the serialized `EvaluationResponse` for a fixed set of requests equals the
  pre-M3.4 output byte for byte.
- Flag ON: ALLOW to REVIEW on CRITICAL impact; DENY preserved; impact never grants access; an
  unauthorized request never calls the impact stage (verified with a spy); failure paths for each
  action class (D2).
- Canary test: a resource name placed in the inventory must not appear anywhere in the gateway
  response body.

**Persistence and migrations.** `DatabaseMigrationTest` for V10–V12. Repository tests for the unique
constraints and the self-loop CHECK. Run the same tests on PostgreSQL 16 (a disposable container, as
in M3.3), not only on H2.

**Security.** Admin-only access on the new paths: 401 without a key, 403 or 401 with a wrong key,
and 404 or 403 for an unknown path under the admin matcher.

**Frontend (later stage).** Lint, typecheck, Vitest and browser checks in the same style as M3.3.

---

## 15. Implementation stages (proposed)

| Stage | Scope | Gate to next stage |
|---|---|---|
| 0 | This document. Documentation corrections. No code. | Review |
| 1 | Canonicalizer (pure function) and its unit tests. No persistence. | Canonicalizer matrix passes |
| 2 | V10 inventory, repository, admin CRUD, admin matcher update, admin-action audit gap decided (Q8) | Admin security tests pass |
| 3 | V11 relationships, admin CRUD, cycle-safe analyzer as a pure class with no gateway use | Analyzer tests pass, including the 1000-node bound |
| 4 | V12 `impact_assessments`, flag-gated gateway stage, `ImpactEscalator`, additive response field | Flag-OFF golden test passes; flag-ON tests pass |
| 5 | Admin impact endpoint under `/api/v1/audit/{requestId}/impact` | Names appear only in the admin view |
| 6 | Frontend impact panel (branch) | Browser checks |

---

## 16. Open questions

These need an answer before the stage that depends on them.

- **Q1.** Should an impact tier of HIGH also escalate ALLOW to REVIEW? D1 approves only CRITICAL.
  Proposal: no, keep HIGH as visible context without escalation, to limit false positives.
- **Q2.** A WRITE or DELETE on an uninventoried resource: stay silent (current design), or escalate
  to REVIEW as "impact unknown"? The second option would route most traffic to REVIEW until the
  inventory is populated.
- **Q3.** Should the agent see `NOT_INVENTORIED`? That response reveals whether a resource is in the
  inventory, which is a small information leak. Proposal: show `NOT_INVENTORIED` to the agent, since
  the agent already knows its own resource string, and accept that it confirms membership.
- **Q4.** Should EXECUTE and EXTERNAL_REQUEST propagate impact along relationships, or stay direct-only
  in v1? Proposal: direct-only in v1.
- **Q5.** Absolute paths are unsupported in v1. Is that acceptable, or does the first real use case need
  an explicit filesystem root kind with an allow-list?
- **Q6.** Deleting a resource that still has relationships: reject with 409 (proposal), or cascade?
- **Q7.** The wall-clock budget for the impact stage. No value is chosen. It must be measured before
  it is set.
- **Q8.** Admin-action audit is absent today. Should it be a prerequisite for Stage 2, since inventory
  changes alter future decisions without a trace?
- **Q9.** Should `impact_assessments` store affected ids (proposed, for the admin drill-down), or only
  counts?

---

## 17. Existing observations (not changed by this document)

- `audit_logs.resource` and `review_requests.resource` are VARCHAR(1024), and the request DTO has no
  length check on `resource`. A longer value is therefore likely to fail at insert. The failure surfaces
  through `GlobalExceptionHandler`, which maps `DataIntegrityViolationException` to 409. This was **not
  verified by a test**, and it should be checked before Stage 1. The canonical rule in section 3.2
  (1024 characters) is chosen to match this column, not to fix this behaviour.
- The `resource` value is passed to the Risk Engine without any validation beyond non-blank.
