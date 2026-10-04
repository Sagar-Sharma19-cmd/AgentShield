-- ============================================================
-- V6: Audit Read API indexes (Phase 4)
--
-- audit_logs previously had no indexes beyond its primary key. The new read-only
-- Audit API (GET /api/v1/audit/{requestId}, GET /api/v1/audit?agentId=&decision=&...)
-- needs efficient access for:
--   - request_id : single-row correlation lookup (GET /api/v1/audit/{requestId}),
--                  mirroring the existing idx_risk_assessments_request_id pattern.
--   - agent_id   : the list endpoint's most common equality filter.
--   - timestamp  : the list endpoint's default sort column (timestamp DESC) and the
--                  from/to range filter.
--
-- No composite (decision, timestamp) index is added: decision has very low
-- cardinality (3 values: ALLOW/REVIEW/DENY), so a dedicated index on it would not
-- meaningfully narrow a scan beyond what the timestamp index already provides for
-- the default-sorted list query. Add one later only if a real query pattern
-- (e.g. dashboards filtering heavily on decision alone) demonstrates the need.
-- ============================================================

CREATE INDEX idx_audit_logs_request_id ON audit_logs (request_id);
CREATE INDEX idx_audit_logs_agent_id ON audit_logs (agent_id);
CREATE INDEX idx_audit_logs_timestamp ON audit_logs (timestamp);
