package com.agentshield.config;

import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.Map;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;

/**
 * V14 on rows written before it: the Risk Engine columns are backfilled from risk_assessments, rows the engine
 * never saw stay NULL, and the new CHECK constraints hold. Own in-memory H2 database, like the other migration tests.
 */
class AuditRiskEngineMigrationTest {

    private static final Instant CREATED = Instant.parse("2026-11-12T10:00:00Z");

    @Test
    @DisplayName("V14 backfills the Risk Engine result from risk_assessments and constrains the new columns")
    void backfillsAndConstrains() {
        DriverManagerDataSource dataSource = new DriverManagerDataSource(
                "jdbc:h2:mem:v14_" + UUID.randomUUID() + ";DB_CLOSE_DELAY=-1", "sa", "");
        JdbcTemplate jdbc = new JdbcTemplate(dataSource);
        flyway(dataSource, "13").migrate();

        UUID failedSafeRequest = UUID.randomUUID();
        UUID answeredRequest = UUID.randomUUID();
        UUID deniedRequest = UUID.randomUUID();
        UUID failedSafe = insertAudit(jdbc, failedSafeRequest, "REVIEW", 10);
        UUID answered = insertAudit(jdbc, answeredRequest, "ALLOW", 10);
        UUID denied = insertAudit(jdbc, deniedRequest, "DENY", 90);
        insertAssessment(jdbc, failedSafeRequest, 65, "HIGH", false);
        insertAssessment(jdbc, answeredRequest, 5, "LOW", true);

        assertEquals(1, flyway(dataSource, "14").migrate().migrationsExecuted);

        assertEquals(65, jdbc.queryForObject("SELECT risk_engine_score FROM audit_logs WHERE id = ?", Integer.class, failedSafe));
        assertEquals("HIGH", jdbc.queryForObject("SELECT risk_engine_tier FROM audit_logs WHERE id = ?", String.class, failedSafe));
        assertEquals(false, jdbc.queryForObject("SELECT risk_engine_available FROM audit_logs WHERE id = ?", Boolean.class, failedSafe));
        assertEquals(10, jdbc.queryForObject("SELECT risk_score FROM audit_logs WHERE id = ?", Integer.class, failedSafe));
        assertEquals(5, jdbc.queryForObject("SELECT risk_engine_score FROM audit_logs WHERE id = ?", Integer.class, answered));
        assertEquals(true, jdbc.queryForObject("SELECT risk_engine_available FROM audit_logs WHERE id = ?", Boolean.class, answered));
        assertNull(jdbc.queryForObject("SELECT risk_engine_score FROM audit_logs WHERE id = ?", Integer.class, denied));
        assertNull(jdbc.queryForObject("SELECT risk_engine_available FROM audit_logs WHERE id = ?", Boolean.class, denied));
        assertNull(jdbc.queryForObject("SELECT claimed_request_id FROM audit_logs WHERE id = ?", UUID.class, denied));

        assertThrows(Exception.class, () -> jdbc.update("UPDATE audit_logs SET risk_engine_score = 101 WHERE id = ?", answered));
        assertThrows(Exception.class, () -> jdbc.update("UPDATE audit_logs SET risk_engine_tier = 'SEVERE' WHERE id = ?", answered));
        // The three Risk Engine columns are recorded together or not at all.
        assertThrows(Exception.class, () -> jdbc.update("UPDATE audit_logs SET risk_engine_score = 40 WHERE id = ?", denied));
        assertThrows(Exception.class, () -> jdbc.update("UPDATE audit_logs SET risk_engine_available = NULL WHERE id = ?", answered));
        jdbc.update("UPDATE audit_logs SET claimed_request_id = ? WHERE id = ?", deniedRequest, answered);
    }

    private static Flyway flyway(DriverManagerDataSource dataSource, String target) {
        return Flyway.configure().dataSource(dataSource).locations("classpath:db/migration")
                .placeholders(Map.of("json_type", "JSON")).target(target).load();
    }

    private static UUID insertAudit(JdbcTemplate jdbc, UUID requestId, String decision, int riskScore) {
        UUID id = UUID.randomUUID();
        String outcome = switch (decision) {
            case "ALLOW" -> "ALLOWED";
            case "REVIEW" -> "REVIEW_REQUIRED";
            default -> "BLOCKED";
        };
        jdbc.update("""
                INSERT INTO audit_logs (id, request_id, agent_id, session_id, tool, action, resource, resource_sensitivity,
                    decision, risk_score, reason, action_outcome, authorization_result, escalated_by, timestamp)
                VALUES (?, ?, 'legacy-agent', 's-1', 'filesystem', 'READ', 'notes/plan.md', 'INTERNAL',
                    ?, ?, 'r', ?, 'AUTHORIZED', 'NONE', ?)
                """, id, requestId, decision, riskScore, outcome, Timestamp.from(CREATED));
        return id;
    }

    private static void insertAssessment(JdbcTemplate jdbc, UUID requestId, int score, String tier, boolean available) {
        jdbc.update("""
                INSERT INTO risk_assessments (id, request_id, risk_score, risk_tier, factors, reason, engine_available, created_at)
                VALUES (?, ?, ?, ?, '[]', 'r', ?, ?)
                """, UUID.randomUUID(), requestId, score, tier, available, Timestamp.from(CREATED));
    }
}
