-- ============================================================
-- V8: Trajectory analysis fields on review requests (Milestone 1)
--
-- review_requests.risk_score / risk_tier hold the EFFECTIVE risk for the reviewer:
-- the higher of the Risk Engine assessment and the trajectory assessment. The original
-- Risk Engine assessment is unchanged in risk_assessments.
--
-- trajectory_* hold the trajectory signal separately so the reviewer can see what
-- caused the escalation. All three are NULL when trajectory analysis did not run or its
-- history query failed. A NULL is "not evaluated", which is distinct from a score of 0.
--
-- Additive only: existing rows keep NULL trajectory fields.
-- ============================================================

ALTER TABLE review_requests ADD COLUMN trajectory_score INTEGER;
ALTER TABLE review_requests ADD COLUMN trajectory_tier VARCHAR(20);
ALTER TABLE review_requests ADD COLUMN trajectory_reason VARCHAR(1000);

ALTER TABLE review_requests ADD CONSTRAINT review_requests_trajectory_score_check CHECK (trajectory_score IS NULL
    OR (trajectory_score >= 0 AND trajectory_score <= 100));
ALTER TABLE review_requests ADD CONSTRAINT review_requests_trajectory_tier_check CHECK (trajectory_tier IS NULL
    OR trajectory_tier IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL'));
