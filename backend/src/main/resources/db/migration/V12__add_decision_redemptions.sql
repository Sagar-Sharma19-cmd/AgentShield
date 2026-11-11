-- ============================================================
-- V12: One-time decision token redemptions (Phase E1)
--
-- The gateway returns a signed decision token (HS256 JWT) on a final ALLOW and on a successful claim of
-- an approved review. Before running the operation, the agent redeems the token at
-- POST /api/v1/gateway/decisions/redeem. One row per redeemed token:
--
-- jti                 : the token id, which is the gateway requestId it was issued for. The PRIMARY KEY
--                       makes redemption one-time: a second INSERT of the same jti fails, which the
--                       endpoint reports as 409. Safe under concurrency (the database decides the winner).
-- registered_agent_id : the VERIFIED registered agent that redeemed it (the token's sub, checked against the
--                       authenticated caller).
-- tool, action        : the operation the token was issued for.
-- resource_hash       : SHA-256 hex of the resource (the token carries the hash, never the raw resource).
-- redeemed_at         : when it was redeemed (application clock).
--
-- Expired tokens are rejected before any INSERT, so this table only holds tokens that were valid when used.
-- Portable SQL: runs on both PostgreSQL and H2 (tests), like V1-V11.
-- ============================================================

CREATE TABLE decision_redemptions (
    jti                 UUID                        NOT NULL,
    registered_agent_id UUID                        NOT NULL,
    tool                VARCHAR(255)                NOT NULL,
    action              VARCHAR(30)                 NOT NULL,
    resource_hash       VARCHAR(64)                 NOT NULL,
    redeemed_at         TIMESTAMP(6) WITH TIME ZONE NOT NULL,
    CONSTRAINT decision_redemptions_pkey PRIMARY KEY (jti),
    CONSTRAINT decision_redemptions_action_check CHECK (action IN
        ('READ', 'WRITE', 'DELETE', 'EXECUTE', 'EXTERNAL_REQUEST'))
);

CREATE INDEX idx_decision_redemptions_agent ON decision_redemptions (registered_agent_id);
