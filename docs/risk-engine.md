# Risk Engine Design

> **Status:** Placeholder — to be implemented in Phase 3.

---

## Overview

The risk engine is an independent Python service that receives an agent action request and returns a numeric risk score between 0 and 100.

- **0–29**: Low risk — likely safe
- **30–59**: Medium risk — warrants attention
- **60–79**: High risk — recommend REVIEW
- **80–100**: Critical risk — recommend DENY

The risk engine is intentionally separated from the Java backend so that:

1. The scoring logic can evolve independently.
2. ML models can be swapped in without touching the core gateway.
3. The service can be tested in isolation.

---

## Technology

| Item | Choice |
|------|--------|
| Language | Python 3.11 |
| Framework | FastAPI |
| Scoring (Phase 3) | Rule-based heuristics |
| Scoring (Phase 6) | scikit-learn anomaly detection |
| Server | Uvicorn |

---

## Scoring Factors (Planned)

The risk score will be computed from a weighted combination of factors:

| Factor | Description | Weight |
|--------|-------------|--------|
| Resource sensitivity | Is the resource a secret file, database, or admin API? | High |
| Action type | DELETE and EXECUTE are riskier than READ | Medium |
| Request frequency | Unusually high rate of requests from one agent | Medium |
| Resource pattern match | Does the resource path match known sensitive patterns? | High |
| Agent history | Has this agent performed suspicious actions before? | Low |
| Trajectory | Does this action continue a suspicious sequence? | High (Phase 6) |

---

## Sensitive Resource Patterns (Planned)

Resources matching these patterns will receive elevated risk scores:

```
.env
*.pem
*.key
*.secret
*/credentials/*
*/admin/*
/etc/passwd
/etc/shadow
```

---

## API Contract

See [`api-design.md`](api-design.md) for the full request/response schema.

---

## Phase 3 Implementation Plan

1. Set up FastAPI project structure in `risk-engine/`.
2. Implement `POST /score` endpoint.
3. Implement rule-based scoring using resource pattern matching.
4. Add unit tests for each scoring factor.
5. Containerise with `Dockerfile`.
6. Connect to backend via Docker Compose.

---

## Future: ML-Based Scoring (Phase 6)

- Collect request logs from audit database.
- Train an anomaly detection model (e.g., Isolation Forest) on normal agent behaviour.
- Use the model to flag requests that deviate from baseline.
- Model artifacts stored in `risk-engine/models/`.
