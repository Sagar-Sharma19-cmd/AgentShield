-- ============================================================
-- V3: Allow AGENT_IDENTITY_MISMATCH in audit_logs.authorization_result
--
-- Recorded when an authenticated agent claims a different agentId in the request body.
-- ============================================================

ALTER TABLE audit_logs DROP CONSTRAINT audit_logs_authorization_result_check;
ALTER TABLE audit_logs ADD CONSTRAINT audit_logs_authorization_result_check CHECK (authorization_result IN
    ('AUTHORIZED', 'UNAUTHORIZED', 'AGENT_NOT_FOUND', 'AGENT_SUSPENDED', 'AGENT_REVOKED',
     'AGENT_IDENTITY_MISMATCH', 'TOOL_NOT_FOUND', 'TOOL_DISABLED', 'PERMISSION_DISABLED'));
