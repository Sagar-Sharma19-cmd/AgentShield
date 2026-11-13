-- ============================================================
-- V14: Risk Engine result and approval claims on audit_logs (Phase M1.1)
--
-- audit_logs.risk_engine_score     : the Risk Engine's score for this request (0-100), or the fail-safe 65 when
--                                    it did not answer. NULL means the engine was not consulted (authorization,
--                                    inspection or policy DENY), or the row is not a gateway evaluation.
-- audit_logs.risk_engine_tier      : its tier (the fail-safe tier is HIGH). NULL as above.
-- audit_logs.risk_engine_available : TRUE when the engine answered, FALSE when it did not (timeout, connection
--                                    error, HTTP error or unreadable answer) and the gateway failed safe to
--                                    HIGH. NULL as above.
-- audit_logs.claimed_request_id    : set only on an "approval claimed" row, written when the owning agent
--                                    claims an approved review (POST /api/v1/gateway/reviews/{id}/claim). It
--                                    holds the request id of the original, held request. The claim row has its
--                                    own request_id, so GET /api/v1/audit/{requestId} still finds one row.
--
-- risk_score keeps its meaning (the policy result's score). The effective score is derived when read, so
-- nothing already stored changes meaning.
--
-- Backfill: the Risk Engine columns are copied from risk_assessments (V4), which has kept one row per
-- consulted request since V4. Additive only. Portable SQL for PostgreSQL and H2 (tests), like V1-V13.
-- FETCH FIRST guards against more than one risk_assessments row per request_id (indexed, not unique).
-- ============================================================

ALTER TABLE audit_logs ADD COLUMN risk_engine_score INTEGER;
ALTER TABLE audit_logs ADD COLUMN risk_engine_tier VARCHAR(20);
ALTER TABLE audit_logs ADD COLUMN risk_engine_available BOOLEAN;
ALTER TABLE audit_logs ADD COLUMN claimed_request_id UUID;

ALTER TABLE audit_logs ADD CONSTRAINT audit_logs_risk_engine_score_check CHECK (risk_engine_score IS NULL
    OR (risk_engine_score >= 0 AND risk_engine_score <= 100));
ALTER TABLE audit_logs ADD CONSTRAINT audit_logs_risk_engine_tier_check CHECK (risk_engine_tier IS NULL
    OR risk_engine_tier IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL'));
-- The three Risk Engine columns are recorded together or not at all.
ALTER TABLE audit_logs ADD CONSTRAINT audit_logs_risk_engine_together_check CHECK (
    (risk_engine_score IS NULL AND risk_engine_tier IS NULL AND risk_engine_available IS NULL)
    OR (risk_engine_score IS NOT NULL AND risk_engine_tier IS NOT NULL AND risk_engine_available IS NOT NULL));

CREATE INDEX idx_audit_logs_claimed_request_id ON audit_logs (claimed_request_id);

UPDATE audit_logs
SET risk_engine_score = (
        SELECT r.risk_score FROM risk_assessments r
        WHERE r.request_id = audit_logs.request_id
        ORDER BY r.created_at FETCH FIRST 1 ROWS ONLY),
    risk_engine_tier = (
        SELECT r.risk_tier FROM risk_assessments r
        WHERE r.request_id = audit_logs.request_id
        ORDER BY r.created_at FETCH FIRST 1 ROWS ONLY),
    risk_engine_available = (
        SELECT r.engine_available FROM risk_assessments r
        WHERE r.request_id = audit_logs.request_id
        ORDER BY r.created_at FETCH FIRST 1 ROWS ONLY)
WHERE EXISTS (SELECT 1 FROM risk_assessments r WHERE r.request_id = audit_logs.request_id);
