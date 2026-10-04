-- ============================================================
-- V5: Review requests (Phase 3 — Human Review Workflow)
--
-- One row per gateway request whose FINAL decision (after risk escalation) is REVIEW.
-- Correlated with the audit_logs/risk_assessments rows for the same gateway request via
-- request_id (UNIQUE — at most one review request per gateway request, and the unique
-- constraint doubles as the index required for request_id lookups).
--
-- original_decision is the PolicyEngine decision BEFORE risk escalation (ALLOW or
-- REVIEW); it can never be DENY, since a DENY is final and never reaches the review
-- workflow (enforced here by the CHECK constraint as well as in application code).
--
-- Portable SQL: runs on both PostgreSQL and H2 (tests), matching the existing
-- migration convention (VARCHAR enum columns with CHECK constraints, no JSONB).
-- ============================================================

CREATE TABLE review_requests (
    id                   UUID                        NOT NULL,
    request_id           UUID                        NOT NULL,
    agent_id             VARCHAR(255)                NOT NULL,
    session_id           VARCHAR(255)                NOT NULL,
    tool                 VARCHAR(255)                NOT NULL,
    action               VARCHAR(30)                 NOT NULL,
    resource             VARCHAR(1024)                NOT NULL,
    resource_sensitivity VARCHAR(20)                 NOT NULL,
    risk_score           INTEGER                     NOT NULL,
    risk_tier            VARCHAR(20)                 NOT NULL,
    original_decision    VARCHAR(20)                 NOT NULL,
    status               VARCHAR(20)                 NOT NULL,
    reason               VARCHAR(1000),
    created_at           TIMESTAMP(6) WITH TIME ZONE NOT NULL,
    updated_at           TIMESTAMP(6) WITH TIME ZONE NOT NULL,
    reviewed_at          TIMESTAMP(6) WITH TIME ZONE,
    CONSTRAINT review_requests_pkey PRIMARY KEY (id),
    CONSTRAINT uk_review_requests_request_id UNIQUE (request_id),
    CONSTRAINT review_requests_action_check CHECK (action IN
        ('READ', 'WRITE', 'DELETE', 'EXECUTE', 'EXTERNAL_REQUEST')),
    CONSTRAINT review_requests_resource_sensitivity_check CHECK (resource_sensitivity IN
        ('PUBLIC', 'INTERNAL', 'SENSITIVE', 'CRITICAL')),
    CONSTRAINT review_requests_risk_tier_check CHECK (risk_tier IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
    CONSTRAINT review_requests_original_decision_check CHECK (original_decision IN ('ALLOW', 'REVIEW')),
    CONSTRAINT review_requests_status_check CHECK (status IN ('PENDING', 'IN_REVIEW', 'APPROVED', 'REJECTED'))
);

CREATE INDEX idx_review_requests_status ON review_requests (status);
CREATE INDEX idx_review_requests_created_at ON review_requests (created_at);
