package com.agentshield.audit;

import com.agentshield.exception.ResourceNotFoundException;
import com.agentshield.model.ActionOutcome;
import com.agentshield.model.ActionType;
import com.agentshield.model.AuthorizationResult;
import com.agentshield.model.DecisionType;
import com.agentshield.model.ResourceSensitivity;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.context.annotation.Import;
import org.springframework.data.domain.Page;
import org.springframework.test.context.ActiveProfiles;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

/**
 * Phase 4 — AuditService read API: requestId correlation lookup and the paginated,
 * filterable search backing GET /api/v1/audit.
 */
@DataJpaTest
@Import(AuditService.class)
@ActiveProfiles("test")
class AuditServiceTest {

    @Autowired
    private AuditService auditService;

    @Autowired
    private AuditRepository auditRepository;

    @Test
    @DisplayName("getByRequestId returns the persisted audit log")
    void testGetByRequestIdFound() {
        UUID requestId = UUID.randomUUID();
        persist(requestId, "agent-a", DecisionType.ALLOW, AuthorizationResult.AUTHORIZED, Instant.now());

        AuditLog found = auditService.getByRequestId(requestId);

        assertEquals(requestId, found.getRequestId());
        assertEquals("agent-a", found.getAgentId());
    }

    @Test
    @DisplayName("getByRequestId throws ResourceNotFoundException for an unknown requestId")
    void testGetByRequestIdMissing() {
        assertThrows(ResourceNotFoundException.class, () -> auditService.getByRequestId(UUID.randomUUID()));
    }

    @Test
    @DisplayName("search filters by agentId")
    void testSearchFiltersByAgentId() {
        persist(UUID.randomUUID(), "agent-a", DecisionType.ALLOW, AuthorizationResult.AUTHORIZED, Instant.now());
        persist(UUID.randomUUID(), "agent-b", DecisionType.ALLOW, AuthorizationResult.AUTHORIZED, Instant.now());

        Page<AuditLog> page = auditService.search("agent-a", null, null, null, null, 0, 20);

        assertEquals(1, page.getTotalElements());
        assertEquals("agent-a", page.getContent().get(0).getAgentId());
    }

    @Test
    @DisplayName("search filters by decision")
    void testSearchFiltersByDecision() {
        persist(UUID.randomUUID(), "agent-a", DecisionType.ALLOW, AuthorizationResult.AUTHORIZED, Instant.now());
        persist(UUID.randomUUID(), "agent-a", DecisionType.DENY, AuthorizationResult.AUTHORIZED, Instant.now());

        Page<AuditLog> page = auditService.search(null, DecisionType.DENY, null, null, null, 0, 20);

        assertEquals(1, page.getTotalElements());
        assertEquals(DecisionType.DENY, page.getContent().get(0).getDecision());
    }

    @Test
    @DisplayName("search filters by authorizationResult")
    void testSearchFiltersByAuthorizationResult() {
        persist(UUID.randomUUID(), "agent-a", DecisionType.DENY, AuthorizationResult.UNAUTHORIZED, Instant.now());
        persist(UUID.randomUUID(), "agent-a", DecisionType.ALLOW, AuthorizationResult.AUTHORIZED, Instant.now());

        Page<AuditLog> page = auditService.search(null, null, AuthorizationResult.UNAUTHORIZED, null, null, 0, 20);

        assertEquals(1, page.getTotalElements());
        assertEquals(AuthorizationResult.UNAUTHORIZED, page.getContent().get(0).getAuthorizationResult());
    }

    @Test
    @DisplayName("search filters by [from, to] timestamp range")
    void testSearchFiltersByDateRange() {
        Instant now = Instant.now();
        persist(UUID.randomUUID(), "agent-a", DecisionType.ALLOW, AuthorizationResult.AUTHORIZED,
                now.minus(10, ChronoUnit.DAYS));
        persist(UUID.randomUUID(), "agent-a", DecisionType.ALLOW, AuthorizationResult.AUTHORIZED, now);

        Page<AuditLog> page = auditService.search(null, null, null, now.minus(1, ChronoUnit.DAYS), null, 0, 20);

        assertEquals(1, page.getTotalElements());
    }

    @Test
    @DisplayName("search defaults to timestamp DESC ordering")
    void testSearchDefaultOrderingIsTimestampDesc() {
        Instant now = Instant.now();
        UUID older = UUID.randomUUID();
        UUID newer = UUID.randomUUID();
        persist(older, "agent-a", DecisionType.ALLOW, AuthorizationResult.AUTHORIZED, now.minus(1, ChronoUnit.HOURS));
        persist(newer, "agent-a", DecisionType.ALLOW, AuthorizationResult.AUTHORIZED, now);

        Page<AuditLog> page = auditService.search(null, null, null, null, null, 0, 20);

        assertEquals(newer, page.getContent().get(0).getRequestId());
        assertEquals(older, page.getContent().get(1).getRequestId());
    }

    @Test
    @DisplayName("search respects page/size for pagination")
    void testSearchPagination() {
        for (int i = 0; i < 25; i++) {
            persist(UUID.randomUUID(), "agent-a", DecisionType.ALLOW, AuthorizationResult.AUTHORIZED, Instant.now());
        }

        Page<AuditLog> firstPage = auditService.search(null, null, null, null, null, 0, 10);
        Page<AuditLog> lastPage = auditService.search(null, null, null, null, null, 2, 10);

        assertEquals(10, firstPage.getContent().size());
        assertEquals(25, firstPage.getTotalElements());
        assertEquals(3, firstPage.getTotalPages());
        assertEquals(5, lastPage.getContent().size());
    }

    private void persist(UUID requestId, String agentId, DecisionType decision,
                          AuthorizationResult authorizationResult, Instant timestamp) {
        AuditLog log = AuditLog.builder()
                .requestId(requestId)
                .agentId(agentId)
                .sessionId("session-1")
                .tool("filesystem")
                .action(ActionType.READ)
                .resource("src/main/App.java")
                .resourceSensitivity(ResourceSensitivity.INTERNAL)
                .decision(decision)
                .riskScore(10)
                .reason("test")
                .actionOutcome(decision == DecisionType.ALLOW ? ActionOutcome.ALLOWED : ActionOutcome.BLOCKED)
                .authorizationResult(authorizationResult)
                .authorizationReason("test reason")
                .timestamp(timestamp)
                .build();
        auditRepository.save(log);
    }
}
