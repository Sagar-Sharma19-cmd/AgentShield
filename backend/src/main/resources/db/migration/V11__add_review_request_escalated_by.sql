-- ============================================================
-- V11: Escalation attribution on review_requests (Phase F5.1)
--
-- escalated_by records which signal sent the request to review, the same value the gateway
-- writes to audit_logs.escalated_by for the same request_id:
--   NONE        : policy held it for review (no later stage changed the decision)
--   RISK_ENGINE : the Risk Engine escalated a policy ALLOW to REVIEW
--   TRAJECTORY  : trajectory analysis escalated an ALLOW to REVIEW
-- NULL means not recorded: a review whose audit row has no escalated_by (written before V9)
-- or has no audit row at all. It does not mean NONE.
--
-- Backfill: copied from the audit row with the same request_id. Additive only; no other
-- column changes. Portable SQL for PostgreSQL and H2 (tests), like V1-V10. FETCH FIRST guards
-- against more than one audit row per request_id (request_id is indexed, not unique, there).
-- ============================================================

ALTER TABLE review_requests ADD COLUMN escalated_by VARCHAR(20);

ALTER TABLE review_requests ADD CONSTRAINT review_requests_escalated_by_check CHECK (escalated_by IS NULL
    OR escalated_by IN ('NONE', 'RISK_ENGINE', 'TRAJECTORY'));

UPDATE review_requests
SET escalated_by = (
    SELECT a.escalated_by
    FROM audit_logs a
    WHERE a.request_id = review_requests.request_id
      AND a.escalated_by IS NOT NULL
    ORDER BY a.timestamp
    FETCH FIRST 1 ROWS ONLY
)
WHERE escalated_by IS NULL;
