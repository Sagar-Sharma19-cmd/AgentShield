package com.agentshield.config;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.dao.DataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;

/**
 * Database-level checks for the V9 trajectory and escalated_by columns on audit_logs. Raw SQL, not the
 * entity, so the CHECK constraints themselves are exercised. Not @Transactional: on PostgreSQL a failed
 * statement aborts its transaction, so each check runs in its own autocommit statement.
 */
@SpringBootTest
@ActiveProfiles("test")
class AuditTrajectoryConstraintTest {

    private static final String INSERT_WITH_TRAJECTORY =
            "INSERT INTO audit_logs (id, request_id, agent_id, session_id, tool, action, resource, "
                    + "resource_sensitivity, decision, risk_score, action_outcome, timestamp, "
                    + "trajectory_score, trajectory_tier, trajectory_reason, escalated_by) "
                    + "VALUES (?, ?, 'agent-1', 'session-1', 'filesystem', 'READ', 'src/Main.java', "
                    + "'PUBLIC', 'REVIEW', 10, 'REVIEW_REQUIRED', ?, ?, ?, ?, ?)";

    private static final String INSERT_LEGACY =
            "INSERT INTO audit_logs (id, request_id, agent_id, session_id, tool, action, resource, "
                    + "resource_sensitivity, decision, risk_score, action_outcome, timestamp) "
                    + "VALUES (?, ?, 'agent-1', 'session-1', 'filesystem', 'READ', 'src/Main.java', "
                    + "'PUBLIC', 'ALLOW', 10, 'ALLOWED', ?)";

    @Autowired
    private JdbcTemplate jdbc;

    @BeforeEach
    @AfterEach
    void clean() {
        jdbc.update("DELETE FROM audit_logs");
    }

    private void insert(Integer score, String tier, String reason, String escalatedBy) {
        jdbc.update(INSERT_WITH_TRAJECTORY, UUID.randomUUID(), UUID.randomUUID(),
                Timestamp.from(Instant.now()), score, tier, reason, escalatedBy);
    }

    @Test
    @DisplayName("Invalid escalated_by is rejected")
    void invalidEscalatedByRejected() {
        assertThrows(DataAccessException.class, () -> insert(60, "HIGH", "x", "SOMEONE"));
    }

    @Test
    @DisplayName("escalated_by is case-sensitive: lowercase is rejected")
    void lowercaseEscalatedByRejected() {
        assertThrows(DataAccessException.class, () -> insert(60, "HIGH", "x", "trajectory"));
    }

    @Test
    @DisplayName("TRAJECTORY escalation without a trajectory tier is rejected")
    void trajectoryEscalationRequiresTier() {
        assertThrows(DataAccessException.class, () -> insert(null, null, null, "TRAJECTORY"));
    }

    @Test
    @DisplayName("TRAJECTORY escalation with a tier is accepted")
    void trajectoryEscalationWithTierAccepted() {
        insert(60, "HIGH", "DENIAL_DENSITY: 2 recent denials", "TRAJECTORY");
        assertEquals(1, count());
    }

    @Test
    @DisplayName("RISK_ENGINE and NONE escalations are accepted with NULL trajectory (not evaluated)")
    void riskEngineAndNoneAcceptedWithNullTrajectory() {
        insert(null, null, null, "RISK_ENGINE");
        insert(null, null, null, "NONE");
        assertEquals(2, count());
    }

    @Test
    @DisplayName("Score below 0 and above 100 are rejected")
    void scoreOutOfRangeRejected() {
        assertThrows(DataAccessException.class, () -> insert(-1, "LOW", "x", "NONE"));
        assertThrows(DataAccessException.class, () -> insert(101, "CRITICAL", "x", "NONE"));
    }

    @Test
    @DisplayName("Boundary scores 0 and 100 are accepted")
    void scoreBoundariesAccepted() {
        insert(0, "LOW", "x", "NONE");
        insert(100, "CRITICAL", "x", "TRAJECTORY");
        assertEquals(2, count());
    }

    @Test
    @DisplayName("Invalid trajectory tier is rejected")
    void invalidTierRejected() {
        assertThrows(DataAccessException.class, () -> insert(60, "SEVERE", "x", "NONE"));
    }

    @Test
    @DisplayName("Trajectory reason over 1000 characters is rejected; exactly 1000 is accepted")
    void reasonLengthBoundary() {
        assertThrows(DataAccessException.class, () -> insert(60, "HIGH", "a".repeat(1001), "NONE"));
        insert(60, "HIGH", "a".repeat(1000), "NONE");
        assertEquals(1, count());
    }

    @Test
    @DisplayName("Legacy row written before V9 is valid and reads back NULL in all four new columns")
    void legacyRowReadsNull() {
        Timestamp now = Timestamp.from(Instant.now());
        jdbc.update(INSERT_LEGACY, UUID.randomUUID(), UUID.randomUUID(), now);

        Object[] row = jdbc.queryForObject(
                "SELECT trajectory_score, trajectory_tier, trajectory_reason, escalated_by FROM audit_logs",
                (rs, n) -> new Object[] {rs.getObject(1), rs.getObject(2), rs.getObject(3), rs.getObject(4)});
        for (Object value : row) {
            assertNull(value, "legacy rows must have NULL in every V9 column");
        }
    }

    private int count() {
        Integer c = jdbc.queryForObject("SELECT COUNT(*) FROM audit_logs", Integer.class);
        return c == null ? -1 : c;
    }
}
