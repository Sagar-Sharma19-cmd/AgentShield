# Risk Engine Design

> **Status:** Phase 1 (deterministic, rule-based scoring) and Phase 2 (Spring Boot gateway
> integration) are both implemented. The Python engine itself is unchanged by Phase 2 — it
> remains a standalone, independently runnable and testable service with the same `POST
> /score` contract. The Java side now calls it; see **Gateway Integration (Phase 2)** below
> and `docs/architecture.md`'s "Risk Engine Integration" section for the full design.
> ML-based scoring and trajectory/behavioral analysis are future phases and are explicitly
> **not** implemented.

---

## Overview

The Risk Engine is an independent Python (FastAPI) service that receives an
agent action context — an `action` and a `resource` — and returns a
deterministic, explainable risk assessment: a numeric score (0–100), a risk
tier, and the individual factors that contributed to the score.

The Risk Engine is a **risk signal only**. It does not authorize or deny
anything, does not grant permissions, and must never override an
authentication or permission decision made elsewhere in AgentShield. The Risk
Engine provides a risk signal and does not grant authorization — it can only
escalate a decision PermissionEngine/PolicyEngine already reached, never
grant or downgrade one. (The authoritative authorization flow —
`Authentication -> PermissionEngine -> PolicyEngine -> RiskEngineClient ->
DecisionEscalator -> AuditService` — is documented in `docs/architecture.md`.)

The Risk Engine is intentionally separate from the Java backend so that:

1. The scoring logic can evolve independently.
2. Future ML models can be introduced without touching the core gateway.
3. The service can be tested in complete isolation.

---

## Technology

| Item | Choice |
|------|--------|
| Language | Python 3.11 |
| Framework | FastAPI |
| Validation | Pydantic |
| Testing | pytest |
| Scoring (Phase 1 — implemented) | Deterministic, rule-based |
| Scoring (future phase) | ML-based anomaly detection (not implemented) |
| Server | Uvicorn |

---

## Input

Minimum input (`POST /score`):

```json
{
  "action": "READ | WRITE | DELETE | EXECUTE | EXTERNAL_REQUEST",
  "resource": "string (non-blank)",
  "resource_sensitivity": "PUBLIC | INTERNAL | SENSITIVE | CRITICAL | null"
}
```

- `action` and `resource` are consistent with the Java domain model
  (`ActionType`, `ResourceSensitivity` in `backend/src/main/java/com/agentshield/model/`).
- An invalid `action` value fails Pydantic validation with a `422` response.
- `resource_sensitivity` is accepted for API-vocabulary consistency with the
  Java `ResourceSensitivity` enum and as a reserved extension point. It is
  **intentionally not an independent scoring input** in Phase 1 and is never
  double-counted: Factor A below derives resource sensitivity exclusively
  from the `resource` string. No current caller supplies this field — in the
  Java backend, `ResourceSensitivity` is always a value `PolicyEngine`
  derives internally (from the resource string, the same way Factor A does),
  never a value it receives as input, and the documented future Risk Engine
  integration contract (`docs/product-requirements.md`, Part 6 — `agentId`,
  `action`, `resource`, `tool`, `metadata`) does not include it either.
  Reconciling a caller-supplied classification with Factor A, if ever
  justified, is future work — not a planned integration today.

---

## Deterministic Risk Factors (Phase 1 — implemented)

Exactly four factors are implemented. Each factor contributes a fixed,
explicit weight — this is **not** a trained model and **not** a weighted/ML
risk model.

| Factor | Trigger | Weight |
|--------|---------|--------|
| A — `RESOURCE_SENSITIVITY` | `resource` matches a sensitive-resource pattern (case-insensitive substring match) | +50 |
| B — `PRODUCTION_ADMIN_CONTEXT` | `resource` matches a production/admin elevated-impact pattern (case-insensitive substring match) | +40 |
| C — `ACTION_BASE_RISK` | Always present — base risk of the action itself | See below |
| D — `COMPOUNDING_RISK` | `action` is `DELETE` or `EXECUTE` **and** Factor B triggered | +20 |

**Factor A patterns:** `.env`, `secret`, `secrets`, `credential`,
`credentials`, `password`, `.pem`, `.key`.

**Factor B patterns:** `prod`, `production`, `admin`, `protected`.

**Factor C — action base risk:**

| Action | Base risk |
|--------|-----------|
| `READ` | +5 |
| `WRITE` | +10 |
| `DELETE` | +30 |
| `EXECUTE` | +30 |
| `EXTERNAL_REQUEST` | +25 |

---

## Scoring Formula

```
total_score = resource_sensitivity_score
             + production_admin_score
             + action_base_score
             + compounding_score

risk_score = min(total_score, 100)
```

The calculation is purely deterministic: the same input always produces the
same `risk_score`, `risk_tier`, and `factors`.

---

## Risk Tiers

| Range | Tier |
|-------|------|
| 0–29 | `LOW` |
| 30–59 | `MEDIUM` |
| 60–79 | `HIGH` |
| 80–100 | `CRITICAL` |

These are risk classifications, not safety guarantees — a `LOW` or `MEDIUM`
tier is not described as "safe."

---

## Output

```json
{
  "risk_score": 100,
  "risk_tier": "CRITICAL",
  "factors": [
    {
      "name": "RESOURCE_SENSITIVITY",
      "score": 50,
      "reason": "Resource matches a sensitive-resource pattern (e.g. secret, credential, password, or key material)."
    },
    {
      "name": "PRODUCTION_ADMIN_CONTEXT",
      "score": 40,
      "reason": "Resource matches a production/admin elevated-impact pattern."
    },
    {
      "name": "ACTION_BASE_RISK",
      "score": 30,
      "reason": "DELETE action carries a base risk of 30."
    },
    {
      "name": "COMPOUNDING_RISK",
      "score": 20,
      "reason": "DELETE action targets a production/admin context, compounding its impact."
    }
  ],
  "reason": "CRITICAL risk: multiple risk factors were detected (RESOURCE_SENSITIVITY, PRODUCTION_ADMIN_CONTEXT, COMPOUNDING_RISK)."
}
```

This example is for a `DELETE` on `secrets/admin/prod-credentials-password.pem`
(140 raw points, capped at 100).

---

## Gateway Integration (Phase 2)

The Python engine's `POST /score` contract and scoring logic are **unchanged** by Phase 2 —
only the Java backend changed. Full design/diagram: `docs/architecture.md`, "Risk Engine
Integration".

- **Who calls it:** `com.agentshield.riskengine.HttpRiskEngineClient`, only when PolicyEngine
  already returned ALLOW or REVIEW for an authorized request. A DENY (from either
  PermissionEngine or PolicyEngine) is final and skips the Risk Engine entirely.
- **Escalation only:** the Java-side `DecisionEscalator` combines the Risk Engine's `risk_tier`
  with the existing decision and can only escalate it (ALLOW→REVIEW→DENY), never grant or
  downgrade. The Risk Engine provides a risk signal and does not grant authorization.
- **Timeout:** `agentshield.risk-engine.timeout-ms` (default 300) bounds both the connect and
  read phase of the Java HTTP call.
- **Fail-safe fallback:** on timeout, connection failure, an HTTP error status, or a response
  the Java client cannot parse, it uses `risk_score=65`, `risk_tier=HIGH`,
  `reason="risk_engine_unavailable"` — never fails open and never throws.
- **Persistence:** every call (successful or fallback) is persisted to the Java-side
  `risk_assessments` table, correlated by `request_id` with the `audit_logs` row for the same
  gateway request.

---

## Implementation

| File | Responsibility |
|------|-----------------|
| `risk-engine/scoring.py` | Pure, dependency-free scoring core: input/output models, individual factor calculations, aggregation, tier classification. No FastAPI, network, or database calls — independently unit-testable. |
| `risk-engine/main.py` | FastAPI app exposing `GET /health` and `POST /score`, which delegates to `scoring.assess_risk`. |
| `risk-engine/test_scoring.py` | Unit tests for the scoring core (factors, score cap, tier boundaries, validation, determinism, explainability). |
| `risk-engine/test_main.py` | HTTP-level tests for the `/score` and `/health` endpoints. |

---

## Explicit Limitations

- This is a **deterministic, rule-based** engine, not a trained or statistical
  model. No accuracy, precision, or recall claims are made about it.
- Pattern matching is case-insensitive substring matching, not semantic
  analysis. It can both over-trigger (e.g. a path that happens to contain
  "admin" in an unrelated word) and under-trigger (resources that are
  sensitive but do not match any listed pattern).
- The engine has no knowledge of agent history, request frequency, or
  session/trajectory context — each request is scored independently.
- `resource_sensitivity` supplied by a caller is accepted but currently
  ignored by scoring (see Input, above) — unchanged by Phase 2; the Java
  client sends PolicyEngine's classification for API-vocabulary consistency,
  but Factor A still derives sensitivity itself from `resource`.
- **No ML or anomaly detection is implemented.** Any such capability is
  future work and must not be described as implemented until it exists.
- The Java-side integration (Phase 2) has no retries or caching around the
  call, and runs synchronously in the request path — see
  `docs/architecture.md`'s "Current Limitations".

---

## Future Work (not implemented)

- ML-based anomaly detection (e.g. isolation forest) trained on audit history,
  as an additional, explainable-adjacent factor — never a black-box override
  of the deterministic factors.
- Context-aware / trajectory-based risk signals (agent history, session
  behavior).
- Reconciling caller-supplied `resource_sensitivity` with Factor A.

---

## API Contract

See [`api-design.md`](api-design.md) for the full request/response schema.
