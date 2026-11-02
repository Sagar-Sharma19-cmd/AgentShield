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
 * Database-level checks for the V8 trajectory columns and CHECK constraints on review_requests.
 * Writes raw SQL, not through the entity, so the constraints themselves are exercised.
 *
 * Not @Transactional: on PostgreSQL a failed statement aborts its transaction, so each
 * constraint check runs as its own autocommit statement and rows are removed afterwards.
 */
@SpringBootTest
@ActiveProfiles("test")
class ReviewTrajectoryConstraintTest {

    private static final String INSERT_WITH_TRAJECTORY =
            "INSERT INTO review_requests (id, request_id, agent_id, session_id, tool, action, resource, "
                    + "resource_sensitivity, risk_score, risk_tier, original_decision, status, reason, "
                    + "created_at, updated_at, reviewed_at, trajectory_score, trajectory_tier, trajectory_reason) "
                    + "VALUES (?, ?, 'agent-1', 'session-1', 'filesystem', 'DELETE', 'dev/tmp.log', "
                    + "'SENSITIVE', 70, 'HIGH', 'REVIEW', 'PENDING', 'needs review', ?, ?, NULL, ?, ?, ?)";

    private static final String INSERT_LEGACY =
            "INSERT INTO review_requests (id, request_id, agent_id, session_id, tool, action, resource, "
                    + "resource_sensitivity, risk_score, risk_tier, original_decision, status, reason, "
                    + "created_at, updated_at, reviewed_at) "
                    + "VALUES (?, ?, 'agent-1', 'session-1', 'filesystem', 'DELETE', 'dev/tmp.log', "
                    + "'SENSITIVE', 70, 'HIGH', 'REVIEW', 'PENDING', 'needs review', ?, ?, NULL)";

    @Autowired
    private JdbcTemplate jdbc;

    @BeforeEach
    @AfterEach
    void clean() {
        jdbc.update("DELETE FROM review_requests");
    }

    private void insertWithTrajectory(Integer score, String tier, String reason) {
        Timestamp now = Timestamp.from(Instant.now());
        jdbc.update(INSERT_WITH_TRAJECTORY, UUID.randomUUID(), UUID.randomUUID(), now, now, score, tier, reason);
    }

    @Test
    @DisplayName("Invalid trajectory tier is rejected by review_requests_trajectory_tier_check")
    void invalidTierRejected() {
        assertThrows(DataAccessException.class, () -> insertWithTrajectory(60, "SEVERE", "x"));
    }

    @Test
    @DisplayName("Tier check is case-sensitive: a lowercase tier is rejected")
    void lowercaseTierRejected() {
        assertThrows(DataAccessException.class, () -> insertWithTrajectory(60, "high", "x"));
    }

    @Test
    @DisplayName("Score below 0 is rejected by review_requests_trajectory_score_check")
    void scoreBelowZeroRejected() {
        assertThrows(DataAccessException.class, () -> insertWithTrajectory(-1, "LOW", "x"));
    }

    @Test
    @DisplayName("Score above 100 is rejected by review_requests_trajectory_score_check")
    void scoreAboveHundredRejected() {
        assertThrows(DataAccessException.class, () -> insertWithTrajectory(101, "CRITICAL", "x"));
    }

    @Test
    @DisplayName("Reason longer than 1000 characters is rejected (VARCHAR(1000))")
    void reasonOverLengthRejected() {
        assertThrows(DataAccessException.class, () -> insertWithTrajectory(60, "HIGH", "a".repeat(1001)));
    }

    @Test
    @DisplayName("Boundary score 0 is accepted")
    void scoreZeroAccepted() {
        insertWithTrajectory(0, "LOW", "x");
        assertEquals(1, count());
    }

    @Test
    @DisplayName("Boundary score 100 is accepted")
    void scoreHundredAccepted() {
        insertWithTrajectory(100, "CRITICAL", "x");
        assertEquals(1, count());
    }

    @Test
    @DisplayName("Every valid tier (LOW, MEDIUM, HIGH, CRITICAL) is accepted")
    void everyValidTierAccepted() {
        for (String tier : new String[] {"LOW", "MEDIUM", "HIGH", "CRITICAL"}) {
            insertWithTrajectory(50, tier, "tier " + tier);
        }
        assertEquals(4, count());
    }

    @Test
    @DisplayName("Reason of exactly 1000 characters is accepted (boundary)")
    void reasonAtLengthBoundaryAccepted() {
        insertWithTrajectory(60, "HIGH", "a".repeat(1000));
        assertEquals(1, count());
    }

    @Test
    @DisplayName("All three trajectory columns NULL is accepted (trajectory not evaluated)")
    void nullTrajectoryAccepted() {
        insertWithTrajectory(null, null, null);
        assertEquals(1, count());
    }

    @Test
    @DisplayName("A pre-V8 style row (no trajectory columns supplied) is valid and reads back NULL")
    void legacyRowWithoutTrajectoryColumnsIsValid() {
        Timestamp now = Timestamp.from(Instant.now());
        jdbc.update(INSERT_LEGACY, UUID.randomUUID(), UUID.randomUUID(), now, now);

        assertEquals(1, count());
        Object[] row = jdbc.queryForObject(
                "SELECT trajectory_score, trajectory_tier, trajectory_reason FROM review_requests",
                (rs, n) -> new Object[] {rs.getObject(1), rs.getObject(2), rs.getObject(3)});
        assertNull(row[0]);
        assertNull(row[1]);
        assertNull(row[2]);
    }

    private int count() {
        Integer c = jdbc.queryForObject("SELECT COUNT(*) FROM review_requests", Integer.class);
        return c == null ? -1 : c;
    }
}
