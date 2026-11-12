-- ============================================================
-- V13: Content inspection of tool-call arguments (Phase V13)
--
-- audit_logs.inspection_verdict  : CLEAN, REVIEW or DENY. NULL means inspection did not run: the request had
--                                  no arguments, inspection was disabled, it was denied before inspection
--                                  (authorization), or the row was written before V13.
-- audit_logs.inspection_findings : the REDACTED findings as a JSON array of
--                                  {category, type, location, preview}. Never the raw values. NULL when
--                                  inspection did not run; [] when it ran and found nothing.
-- review_requests.inspection_findings : the same redacted findings for the review's request.
-- review_requests.args_sha256    : SHA-256 hex of the canonical JSON of the request's arguments. The claim's
--                                  decision token carries it, so the redeem must present the same arguments.
--                                  The arguments themselves are never stored. NULL when there were none.
--
-- escalated_by gains INSPECTION on both tables: content inspection raised the decision (to REVIEW), or
-- denied it (a secret in the arguments).
--
-- ${json_type} is a Flyway placeholder: jsonb on PostgreSQL (application.properties) and JSON on the H2 test
-- database (application-test.properties), because H2 has no JSONB type. Additive only; existing rows keep NULL.
-- ============================================================

ALTER TABLE audit_logs ADD COLUMN inspection_verdict VARCHAR(10);
ALTER TABLE audit_logs ADD COLUMN inspection_findings ${json_type};

ALTER TABLE audit_logs ADD CONSTRAINT audit_logs_inspection_verdict_check CHECK (inspection_verdict IS NULL
    OR inspection_verdict IN ('CLEAN', 'REVIEW', 'DENY'));

ALTER TABLE audit_logs DROP CONSTRAINT audit_logs_escalated_by_check;
ALTER TABLE audit_logs ADD CONSTRAINT audit_logs_escalated_by_check CHECK (escalated_by IS NULL
    OR escalated_by IN ('NONE', 'RISK_ENGINE', 'TRAJECTORY', 'INSPECTION'));
-- An inspection escalation is only meaningful with a recorded REVIEW or DENY verdict. COALESCE because a CHECK
-- passes when its expression is NULL, and inspection_verdict IN (...) is NULL for a NULL verdict.
ALTER TABLE audit_logs ADD CONSTRAINT audit_logs_escalated_by_inspection_check CHECK (escalated_by <> 'INSPECTION'
    OR COALESCE(inspection_verdict, '') IN ('REVIEW', 'DENY'));

ALTER TABLE review_requests ADD COLUMN inspection_findings ${json_type};
ALTER TABLE review_requests ADD COLUMN args_sha256 VARCHAR(64);

ALTER TABLE review_requests DROP CONSTRAINT review_requests_escalated_by_check;
ALTER TABLE review_requests ADD CONSTRAINT review_requests_escalated_by_check CHECK (escalated_by IS NULL
    OR escalated_by IN ('NONE', 'RISK_ENGINE', 'TRAJECTORY', 'INSPECTION'));
