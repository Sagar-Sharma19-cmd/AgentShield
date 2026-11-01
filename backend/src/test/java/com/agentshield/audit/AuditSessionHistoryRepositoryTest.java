package com.agentshield.audit;

import com.agentshield.model.ActionOutcome;
import com.agentshield.model.ActionType;
import com.agentshield.model.AuthorizationResult;
import com.agentshield.model.DecisionType;
import com.agentshield.model.ResourceSensitivity;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.test.context.ActiveProfiles;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;

/**
 * Trajectory history query (findTop10BySessionIdAndRegisteredAgentIdOrderByTimestampDesc)
 * and the V7 composite index it relies on. Covers session isolation and agent isolation.
 */
@DataJpaTest
@ActiveProfiles("test")
class AuditSessionHistoryRepositoryTest {

    private static final Instant NOW = Instant.parse("2026-01-01T12:00:00Z");

    @Autowired
    private AuditRepository auditRepository;

    @Autowired
    private EntityManager entityManager;

    @Test
    @DisplayName("Returns only the requested session and verified agent, newest first")
    void returnsOnlyMatchingSessionAndAgentNewestFirst() {
        UUID agentA = UUID.randomUUID();
        UUID agentB = UUID.randomUUID();
        AuditLog newest = save("session-1", agentA, "agent-a", NOW.minusSeconds(1));
        AuditLog middle = save("session-1", agentA, "agent-a", NOW.minusSeconds(2));
        AuditLog oldest = save("session-1", agentA, "agent-a", NOW.minusSeconds(3));
        save("session-1", agentB, "agent-b", NOW.minusMillis(500));   // same session, different agent
        save("session-2", agentA, "agent-a", NOW.minusMillis(1500));  // same agent, different session

        List<AuditLog> result = auditRepository.findTop10BySessionIdAndRegisteredAgentIdOrderByTimestampDesc(
                "session-1", agentA);

        assertEquals(List.of(newest.getRequestId(), middle.getRequestId(), oldest.getRequestId()),
                result.stream().map(AuditLog::getRequestId).toList());
    }

    @Test
    @DisplayName("Another agent that claims the same agentId string does not match the verified agent")
    void claimedAgentIdDoesNotMatchVerifiedAgent() {
        UUID verifiedAgent = UUID.randomUUID();
        UUID impostor = UUID.randomUUID();
        // The impostor's rows carry the victim's name in agent_id, but their registered id is the impostor's.
        save("shared-session", impostor, "victim-agent", NOW.minusSeconds(1));

        List<AuditLog> result = auditRepository.findTop10BySessionIdAndRegisteredAgentIdOrderByTimestampDesc(
                "shared-session", verifiedAgent);

        assertEquals(List.of(), result);
    }

    @Test
    @DisplayName("Returns at most 10 rows, the 10 most recent")
    void capsAtTenNewestRows() {
        UUID agent = UUID.randomUUID();
        for (int i = 1; i <= 12; i++) {
            save("session-cap", agent, "agent-cap", NOW.minusSeconds(i));
        }

        List<AuditLog> result = auditRepository.findTop10BySessionIdAndRegisteredAgentIdOrderByTimestampDesc(
                "session-cap", agent);

        assertEquals(10, result.size());
        assertEquals(NOW.minusSeconds(1), result.get(0).getTimestamp());
        assertEquals(NOW.minusSeconds(10), result.get(9).getTimestamp());
    }

    @Test
    @DisplayName("Rows without a registered agent id are never returned for a verified agent")
    void rowsWithoutRegisteredAgentExcluded() {
        UUID agent = UUID.randomUUID();
        save("session-null", null, "ghost", NOW.minusSeconds(1));

        List<AuditLog> result = auditRepository.findTop10BySessionIdAndRegisteredAgentIdOrderByTimestampDesc(
                "session-null", agent);

        assertEquals(List.of(), result);
    }

    @Test
    @DisplayName("V7 created idx_audit_logs_session_agent_timestamp on (session_id, registered_agent_id, timestamp)")
    void v7CompositeIndexExistsWithColumnOrder() {
        @SuppressWarnings("unchecked")
        List<String> columns = entityManager.createNativeQuery(
                        "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.INDEX_COLUMNS "
                                + "WHERE UPPER(TABLE_NAME) = 'AUDIT_LOGS' "
                                + "AND INDEX_NAME = 'IDX_AUDIT_LOGS_SESSION_AGENT_TIMESTAMP' "
                                + "ORDER BY ORDINAL_POSITION")
                .getResultList();

        assertEquals(List.of("SESSION_ID", "REGISTERED_AGENT_ID", "TIMESTAMP"), columns);
    }

    private AuditLog save(String sessionId, UUID registeredAgentId, String claimedAgentId, Instant timestamp) {
        return auditRepository.save(AuditLog.builder()
                .requestId(UUID.randomUUID())
                .agentId(claimedAgentId)
                .sessionId(sessionId)
                .tool("filesystem")
                .action(ActionType.READ)
                .resource("src/main/App.java")
                .resourceSensitivity(ResourceSensitivity.INTERNAL)
                .decision(DecisionType.ALLOW)
                .riskScore(10)
                .reason("test")
                .actionOutcome(ActionOutcome.ALLOWED)
                .registeredAgentId(registeredAgentId)
                .authorizationResult(AuthorizationResult.AUTHORIZED)
                .authorizationReason("ok")
                .timestamp(timestamp)
                .build());
    }
}
