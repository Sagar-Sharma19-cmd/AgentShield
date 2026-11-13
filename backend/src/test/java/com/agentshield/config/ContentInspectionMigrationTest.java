package com.agentshield.config;

import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;

import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;

/**
 * V13 on a clean database (every migration from V1) and on rows written before V13. Uses its own in-memory H2
 * database, with the H2 value of the json_type placeholder; PostgreSQL uses jsonb (application.properties).
 */
class ContentInspectionMigrationTest {

    private static final Instant CREATED = Instant.parse("2026-11-01T10:00:00Z");

    @Test
    @DisplayName("V1..V13 apply cleanly; old rows keep NULL; the new CHECK constraints hold")
    void migratesAndConstrains() {
        DriverManagerDataSource dataSource = new DriverManagerDataSource(
                "jdbc:h2:mem:v13_" + UUID.randomUUID() + ";DB_CLOSE_DELAY=-1", "sa", "");
        JdbcTemplate jdbc = new JdbcTemplate(dataSource);
        flyway(dataSource, "12").migrate();
        UUID oldAudit = insertAudit(jdbc, "TRAJECTORY", "HIGH");
        UUID oldReview = UUID.randomUUID();
        insertReview(jdbc, oldReview);

        assertEquals(1, flyway(dataSource, "13").migrate().migrationsExecuted);

        assertNull(jdbc.queryForObject("SELECT inspection_verdict FROM audit_logs WHERE id = ?", String.class, oldAudit));
        assertNull(jdbc.queryForObject("SELECT inspection_findings FROM audit_logs WHERE id = ?", Object.class, oldAudit));
        assertNull(jdbc.queryForObject("SELECT args_sha256 FROM review_requests WHERE id = ?", String.class, oldReview));
        assertNull(jdbc.queryForObject("SELECT inspection_findings FROM review_requests WHERE id = ?", Object.class, oldReview));
        assertEquals("TRAJECTORY", jdbc.queryForObject("SELECT escalated_by FROM audit_logs WHERE id = ?", String.class, oldAudit));

        // INSPECTION is a valid attribution, but only with an inspection verdict that could have raised it.
        assertThrows(Exception.class, () -> jdbc.update("UPDATE audit_logs SET escalated_by = 'INSPECTION' WHERE id = ?", oldAudit));
        jdbc.update("UPDATE audit_logs SET inspection_verdict = 'REVIEW', escalated_by = 'INSPECTION' WHERE id = ?", oldAudit);
        assertThrows(Exception.class, () -> jdbc.update("UPDATE audit_logs SET inspection_verdict = 'MAYBE' WHERE id = ?", oldAudit));
        assertThrows(Exception.class, () -> jdbc.update("UPDATE audit_logs SET escalated_by = 'POLICY' WHERE id = ?", oldAudit));
        jdbc.update("UPDATE review_requests SET escalated_by = 'INSPECTION' WHERE id = ?", oldReview);
        assertThrows(Exception.class, () -> jdbc.update("UPDATE review_requests SET escalated_by = 'POLICY' WHERE id = ?", oldReview));
    }

    @Test
    @DisplayName("A fresh database migrates straight to the latest version")
    void cleanDatabase() {
        DriverManagerDataSource dataSource = new DriverManagerDataSource(
                "jdbc:h2:mem:v13_clean_" + UUID.randomUUID() + ";DB_CLOSE_DELAY=-1", "sa", "");
        assertEquals(14, flyway(dataSource, "latest").migrate().migrationsExecuted);
    }

    private static Flyway flyway(DriverManagerDataSource dataSource, String target) {
        return Flyway.configure().dataSource(dataSource).locations("classpath:db/migration")
                .placeholders(Map.of("json_type", "JSON")).target(target).load();
    }

    private static UUID insertAudit(JdbcTemplate jdbc, String escalatedBy, String trajectoryTier) {
        UUID id = UUID.randomUUID();
        jdbc.update("""
                INSERT INTO audit_logs (id, request_id, agent_id, session_id, tool, action, resource, resource_sensitivity,
                    decision, risk_score, reason, action_outcome, authorization_result, trajectory_score, trajectory_tier,
                    escalated_by, timestamp)
                VALUES (?, ?, 'legacy-agent', 's-1', 'filesystem', 'READ', 'src/a', 'INTERNAL',
                    'REVIEW', 10, 'held', 'REVIEW_REQUIRED', 'AUTHORIZED', 70, ?, ?, ?)
                """, id, UUID.randomUUID(), trajectoryTier, escalatedBy, Timestamp.from(CREATED));
        return id;
    }

    private static void insertReview(JdbcTemplate jdbc, UUID id) {
        jdbc.update("""
                INSERT INTO review_requests (id, request_id, agent_id, session_id, tool, action, resource,
                    resource_sensitivity, risk_score, risk_tier, original_decision, status, reason, created_at, updated_at,
                    expires_at)
                VALUES (?, ?, 'legacy-agent', 's-1', 'filesystem', 'DELETE', 'tmp/x', 'INTERNAL', 60, 'HIGH', 'REVIEW',
                    'PENDING', 'needs review', ?, ?, ?)
                """, id, UUID.randomUUID(), Timestamp.from(CREATED), Timestamp.from(CREATED),
                Timestamp.from(CREATED.plus(Duration.ofMinutes(30))));
    }
}
