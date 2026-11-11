package com.agentshield.enforcement;

import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.UUID;

/**
 * The decision_redemptions table (V12). A plain INSERT, never an upsert: the primary key on jti is what makes
 * a token one-time, so a second INSERT of the same jti must fail rather than be merged into the first.
 */
@Repository
public class DecisionRedemptionStore {

    private final JdbcTemplate jdbcTemplate;

    public DecisionRedemptionStore(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    /** @return true when this call recorded the redemption, false when the jti was already redeemed */
    public boolean insertOnce(UUID jti, UUID agentId, String tool, String action, String resourceHash, Instant redeemedAt) {
        try {
            jdbcTemplate.update("INSERT INTO decision_redemptions "
                            + "(jti, registered_agent_id, tool, action, resource_hash, redeemed_at) VALUES (?, ?, ?, ?, ?, ?)",
                    jti, agentId, tool, action, resourceHash, OffsetDateTime.ofInstant(redeemedAt, ZoneOffset.UTC));
            return true;
        } catch (DuplicateKeyException alreadyRedeemed) {
            return false;
        }
    }

    public boolean exists(UUID jti) {
        Integer count = jdbcTemplate.queryForObject("SELECT COUNT(*) FROM decision_redemptions WHERE jti = ?",
                Integer.class, jti);
        return count != null && count > 0;
    }
}
