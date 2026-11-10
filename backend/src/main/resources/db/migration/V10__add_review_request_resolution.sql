-- ============================================================
-- V10: Close the human-review loop (Phase B3)
--
-- registered_agent_id : the VERIFIED registered agent that made the gateway request
--                       (AuthorizationDecision.agentId(), never the client-claimed agentId).
--                       Only that agent may read or claim the review through
--                       /api/v1/gateway/reviews/**. NULL on rows whose audit row has no
--                       registered agent; such a review is not visible to any agent.
-- reviewer            : who approved or rejected it (free text, 1-100 chars, supplied by the operator).
--                       Not an authenticated identity: the admin API key is shared.
-- decision_note       : the reviewer's note (required on reject, optional on approve).
-- consumed_at         : when the owning agent claimed the approval. Set exactly once
--                       (conditional UPDATE ... WHERE consumed_at IS NULL).
-- expires_at          : created_at + agentshield.review.ttl-minutes. A review cannot be started,
--                       approved, rejected or claimed after it.
--
-- Backfill: registered_agent_id from the audit row of the same request_id; expires_at =
-- created_at + 30 minutes (the default TTL), so existing open reviews older than that are
-- expired after this migration.
--
-- Portable SQL: runs on both PostgreSQL and H2 (tests), like V1-V9. INTERVAL '30' MINUTE is the
-- SQL-standard interval literal, which both accept. FETCH FIRST is standard as well; it guards
-- against more than one audit row per request_id (request_id is indexed, not unique, in audit_logs).
-- ============================================================

ALTER TABLE review_requests ADD COLUMN registered_agent_id UUID;
ALTER TABLE review_requests ADD COLUMN reviewer VARCHAR(100);
ALTER TABLE review_requests ADD COLUMN decision_note VARCHAR(1000);
ALTER TABLE review_requests ADD COLUMN consumed_at TIMESTAMP(6) WITH TIME ZONE;
ALTER TABLE review_requests ADD COLUMN expires_at TIMESTAMP(6) WITH TIME ZONE;

UPDATE review_requests
SET registered_agent_id = (
    SELECT a.registered_agent_id
    FROM audit_logs a
    WHERE a.request_id = review_requests.request_id
      AND a.registered_agent_id IS NOT NULL
    ORDER BY a.timestamp
    FETCH FIRST 1 ROWS ONLY
)
WHERE registered_agent_id IS NULL;

UPDATE review_requests
SET expires_at = created_at + INTERVAL '30' MINUTE
WHERE expires_at IS NULL;

ALTER TABLE review_requests ALTER COLUMN expires_at SET NOT NULL;

-- Only an approved review can be consumed.
ALTER TABLE review_requests ADD CONSTRAINT review_requests_consumed_check CHECK (consumed_at IS NULL
    OR status = 'APPROVED');
