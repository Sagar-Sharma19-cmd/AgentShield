-- ============================================================
-- V4: Risk assessments (Phase 2 — Risk Engine gateway integration)
--
-- One row per Risk Engine call, correlated with the audit_logs row for the same
-- gateway request via request_id. factors is stored as JSON text (not JSONB) to stay
-- portable across PostgreSQL and H2 (tests), matching the existing migration convention.
-- engine_available = false marks the approved fail-safe fallback (Risk Engine timeout,
-- outage, or an invalid response) rather than a real score from the Python service.
-- ============================================================

CREATE TABLE risk_assessments (
    id               UUID                        NOT NULL,
    request_id       UUID                        NOT NULL,
    risk_score       INTEGER                     NOT NULL,
    risk_tier        VARCHAR(20)                 NOT NULL,
    factors          VARCHAR(4000),
    reason           VARCHAR(1000),
    engine_available BOOLEAN                     NOT NULL,
    created_at       TIMESTAMP(6) WITH TIME ZONE NOT NULL,
    CONSTRAINT risk_assessments_pkey PRIMARY KEY (id),
    CONSTRAINT risk_assessments_risk_tier_check CHECK (risk_tier IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL'))
);

CREATE INDEX idx_risk_assessments_request_id ON risk_assessments (request_id);
