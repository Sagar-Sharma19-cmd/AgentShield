package com.agentshield.config;

import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;

import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;

/**
 * V11 backfill on a database that already holds review rows: migrate a private H2 database to V10,
 * insert audit and review rows the way the pre-V11 application wrote them, then apply V11 and check that
 * review_requests.escalated_by is copied from the audit row of the same request_id. Uses its own
 * in-memory database, so it never touches the shared test schema.
 */
class ReviewEscalationMigrationTest {

    private static final Instant CREATED = Instant.parse("2026-11-01T10:00:00Z");

    @Test
    @DisplayName("V11 backfills escalated_by from audit_logs; unattributed or missing audit rows stay NULL")
    void backfillsEscalatedByFromAuditLogs() {
        DriverManagerDataSource dataSource = new DriverManagerDataSource(
                "jdbc:h2:mem:v11_backfill_" + UUID.randomUUID() + ";DB_CLOSE_DELAY=-1", "sa", "");
        JdbcTemplate jdbc = new JdbcTemplate(dataSource);
        flyway(dataSource, "10").migrate();

        UUID policyReview = reviewWithAudit(jdbc, "NONE", null);
        UUID riskReview = reviewWithAudit(jdbc, "RISK_ENGINE", null);
        UUID trajectoryReview = reviewWithAudit(jdbc, "TRAJECTORY", "HIGH");
        UUID preV9Review = reviewWithAudit(jdbc, null, null);
        UUID orphanReview = UUID.randomUUID();
        insertReview(jdbc, orphanReview, UUID.randomUUID());

        flyway(dataSource, "11").migrate();

        assertEquals("NONE", escalatedBy(jdbc, policyReview));
        assertEquals("RISK_ENGINE", escalatedBy(jdbc, riskReview));
        assertEquals("TRAJECTORY", escalatedBy(jdbc, trajectoryReview));
        assertNull(escalatedBy(jdbc, preV9Review), "audit row written before V9: not recorded, not NONE");
        assertNull(escalatedBy(jdbc, orphanReview), "no audit row: not recorded");

        // Same CHECK values as audit_logs.escalated_by; NULL stays allowed.
        assertThrows(Exception.class, () -> jdbc.update(
                "UPDATE review_requests SET escalated_by = 'POLICY' WHERE id = ?", policyReview));
        jdbc.update("UPDATE review_requests SET escalated_by = NULL WHERE id = ?", policyReview);
        assertNull(escalatedBy(jdbc, policyReview));
    }

    private static Flyway flyway(DriverManagerDataSource dataSource, String target) {
        return Flyway.configure().dataSource(dataSource).locations("classpath:db/migration").target(target).load();
    }

    private static UUID reviewWithAudit(JdbcTemplate jdbc, String escalatedBy, String trajectoryTier) {
        UUID requestId = UUID.randomUUID();
        UUID reviewId = UUID.randomUUID();
        jdbc.update("""
                INSERT INTO audit_logs (id, request_id, agent_id, session_id, tool, action, resource, resource_sensitivity,
                    decision, risk_score, reason, action_outcome, authorization_result, trajectory_score, trajectory_tier,
                    escalated_by, timestamp)
                VALUES (?, ?, 'legacy-agent', 's-1', 'filesystem', 'DELETE', 'tmp/x', 'INTERNAL',
                    'REVIEW', 60, 'needs review', 'REVIEW_REQUIRED', 'AUTHORIZED', ?, ?, ?, ?)
                """, UUID.randomUUID(), requestId, trajectoryTier == null ? null : 70, trajectoryTier, escalatedBy,
                Timestamp.from(CREATED));
        insertReview(jdbc, reviewId, requestId);
        return reviewId;
    }

    private static void insertReview(JdbcTemplate jdbc, UUID id, UUID requestId) {
        jdbc.update("""
                INSERT INTO review_requests (id, request_id, agent_id, session_id, tool, action, resource,
                    resource_sensitivity, risk_score, risk_tier, original_decision, status, reason, created_at, updated_at,
                    expires_at)
                VALUES (?, ?, 'legacy-agent', 's-1', 'filesystem', 'DELETE', 'tmp/x', 'INTERNAL', 60, 'HIGH', 'REVIEW',
                    'PENDING', 'needs review', ?, ?, ?)
                """, id, requestId, Timestamp.from(CREATED), Timestamp.from(CREATED),
                Timestamp.from(CREATED.plus(Duration.ofMinutes(30))));
    }

    private static String escalatedBy(JdbcTemplate jdbc, UUID reviewId) {
        return jdbc.queryForObject("SELECT escalated_by FROM review_requests WHERE id = ?", String.class, reviewId);
    }
}
