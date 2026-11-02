-- ============================================================
-- V9: Trajectory and escalation attribution on audit_logs (Milestone 1)
--
-- trajectory_* record the trajectory signal for each gateway evaluation. NULL means
-- trajectory was NOT evaluated (legacy row, trajectory disabled, skipped for a DENY,
-- or its history lookup/evaluator failed). A score of 0 means it WAS evaluated and
-- found no signal. The two are deliberately distinct.
--
-- escalated_by records which signal changed the decision: NONE, RISK_ENGINE or
-- TRAJECTORY. NULL means the row was written before this migration and the value
-- was not recorded. It does not mean NONE.
--
-- Additive only: existing rows keep NULL in all four columns.
-- ============================================================

ALTER TABLE audit_logs ADD COLUMN trajectory_score INTEGER;
ALTER TABLE audit_logs ADD COLUMN trajectory_tier VARCHAR(20);
ALTER TABLE audit_logs ADD COLUMN trajectory_reason VARCHAR(1000);
ALTER TABLE audit_logs ADD COLUMN escalated_by VARCHAR(20);

ALTER TABLE audit_logs ADD CONSTRAINT audit_logs_trajectory_score_check CHECK (trajectory_score IS NULL
    OR (trajectory_score >= 0 AND trajectory_score <= 100));
ALTER TABLE audit_logs ADD CONSTRAINT audit_logs_trajectory_tier_check CHECK (trajectory_tier IS NULL
    OR trajectory_tier IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL'));
ALTER TABLE audit_logs ADD CONSTRAINT audit_logs_escalated_by_check CHECK (escalated_by IS NULL
    OR escalated_by IN ('NONE', 'RISK_ENGINE', 'TRAJECTORY'));
-- A trajectory escalation is only meaningful with a recorded trajectory tier.
ALTER TABLE audit_logs ADD CONSTRAINT audit_logs_escalated_by_trajectory_check CHECK (escalated_by <> 'TRAJECTORY'
    OR trajectory_tier IS NOT NULL);
