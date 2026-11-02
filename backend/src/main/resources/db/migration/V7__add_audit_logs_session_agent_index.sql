-- ============================================================
-- V7: Trajectory analysis history index (Milestone 1)
--
-- TrajectoryService reads the last 10 audit rows for one session, scoped to the
-- verified caller, newest first:
--   WHERE session_id = ? AND registered_agent_id = ? ORDER BY timestamp DESC LIMIT 10
--
-- Column order is deliberate: the two equality filters come first, then the sort
-- column, so the query is served by one index range read. registered_agent_id (not
-- the client-claimed agent_id) scopes the history, so a caller cannot write rows into
-- another agent's session history.
--
-- Additive only: no existing index or column changes.
-- ============================================================

CREATE INDEX idx_audit_logs_session_agent_timestamp ON audit_logs (session_id, registered_agent_id, timestamp);
