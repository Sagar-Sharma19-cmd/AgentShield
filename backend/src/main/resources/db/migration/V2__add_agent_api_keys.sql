-- ============================================================
-- V2: Agent API key credentials
--
-- api_key_hash   : hex HMAC-SHA256(pepper, api_key). Plaintext keys are never stored.
--                  NULL when the agent has no usable key (e.g. REVOKED, or registered
--                  before V2 — issue one with POST /api/v1/agents/{id}/rotate-key).
-- api_key_prefix : non-secret display prefix (e.g. 'agk_live_abcd') to identify a key.
-- ============================================================

ALTER TABLE agents ADD COLUMN api_key_hash VARCHAR(64);
ALTER TABLE agents ADD COLUMN api_key_prefix VARCHAR(16);
ALTER TABLE agents ADD CONSTRAINT uk_agents_api_key_hash UNIQUE (api_key_hash);
