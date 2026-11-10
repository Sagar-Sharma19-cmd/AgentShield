package com.agentshield.config;

import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;

import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Map;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;

/**
 * V10 backfill on a database that already holds review rows: migrate a private H2 database to V9,
 * insert rows the way the pre-V10 application wrote them, then apply V10 and check the result.
 * Uses its own in-memory database, so it never touches the shared test schema.
 */
class ReviewResolutionMigrationTest {

    @Test
    @DisplayName("V10 backfills registered_agent_id from audit_logs and expires_at = created_at + 30 minutes")
    void backfillsExistingReviews() {
        DriverManagerDataSource dataSource = new DriverManagerDataSource(
                "jdbc:h2:mem:v10_backfill_" + UUID.randomUUID() + ";DB_CLOSE_DELAY=-1", "sa", "");
        JdbcTemplate jdbc = new JdbcTemplate(dataSource);
        flyway(dataSource, "9").migrate();

        Instant created = Instant.parse("2026-11-01T10:00:00Z");
        UUID agentId = UUID.randomUUID();
        UUID withAudit = UUID.randomUUID();
        UUID withoutAudit = UUID.randomUUID();
        UUID reviewWithAudit = UUID.randomUUID();
        UUID reviewWithoutAudit = UUID.randomUUID();

        insertAudit(jdbc, withAudit, agentId, created);
        insertReview(jdbc, reviewWithAudit, withAudit, created);
        insertReview(jdbc, reviewWithoutAudit, withoutAudit, created.plus(Duration.ofMinutes(5)));

        flyway(dataSource, "10").migrate();

        Map<String, Object> backfilled = jdbc.queryForMap(
                "SELECT registered_agent_id, expires_at, reviewer, decision_note, consumed_at FROM review_requests WHERE id = ?",
                reviewWithAudit);
        assertEquals(agentId, backfilled.get("REGISTERED_AGENT_ID"));
        assertEquals(created.plus(Duration.ofMinutes(30)), toInstant(backfilled.get("EXPIRES_AT")));
        assertNull(backfilled.get("REVIEWER"));
        assertNull(backfilled.get("DECISION_NOTE"));
        assertNull(backfilled.get("CONSUMED_AT"));

        Map<String, Object> orphan = jdbc.queryForMap(
                "SELECT registered_agent_id, expires_at FROM review_requests WHERE id = ?", reviewWithoutAudit);
        assertNull(orphan.get("REGISTERED_AGENT_ID"), "no audit row: not visible to any agent");
        assertEquals(created.plus(Duration.ofMinutes(35)), toInstant(orphan.get("EXPIRES_AT")));

        // expires_at is NOT NULL after the backfill, and consumed_at only applies to APPROVED reviews.
        assertThrows(Exception.class, () -> jdbc.update("UPDATE review_requests SET expires_at = NULL WHERE id = ?",
                reviewWithAudit));
        assertThrows(Exception.class, () -> jdbc.update(
                "UPDATE review_requests SET consumed_at = CURRENT_TIMESTAMP WHERE id = ?", reviewWithAudit));
    }

    private static Flyway flyway(DriverManagerDataSource dataSource, String target) {
        return Flyway.configure().dataSource(dataSource).locations("classpath:db/migration").target(target).load();
    }

    private static void insertAudit(JdbcTemplate jdbc, UUID requestId, UUID agentId, Instant at) {
        jdbc.update("""
                INSERT INTO audit_logs (id, request_id, agent_id, session_id, tool, action, resource, resource_sensitivity,
                    decision, risk_score, reason, action_outcome, registered_agent_id, authorization_result, timestamp)
                VALUES (?, ?, 'legacy-agent', 's-1', 'filesystem', 'DELETE', 'tmp/x', 'INTERNAL',
                    'REVIEW', 60, 'needs review', 'REVIEW_REQUIRED', ?, 'AUTHORIZED', ?)
                """, UUID.randomUUID(), requestId, agentId, Timestamp.from(at));
    }

    private static void insertReview(JdbcTemplate jdbc, UUID id, UUID requestId, Instant created) {
        jdbc.update("""
                INSERT INTO review_requests (id, request_id, agent_id, session_id, tool, action, resource,
                    resource_sensitivity, risk_score, risk_tier, original_decision, status, reason, created_at, updated_at)
                VALUES (?, ?, 'legacy-agent', 's-1', 'filesystem', 'DELETE', 'tmp/x', 'INTERNAL', 60, 'HIGH', 'REVIEW',
                    'PENDING', 'needs review', ?, ?)
                """, id, requestId, Timestamp.from(created), Timestamp.from(created));
    }

    private static Instant toInstant(Object value) {
        if (value instanceof java.time.OffsetDateTime odt) {
            return odt.toInstant().truncatedTo(ChronoUnit.MICROS);
        }
        if (value instanceof Timestamp ts) {
            return ts.toInstant();
        }
        throw new IllegalStateException("Unexpected timestamp type " + value.getClass());
    }
}
