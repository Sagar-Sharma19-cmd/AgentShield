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
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.test.context.ActiveProfiles;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Phase 4 — AuditRepository: requestId lookup, Specification-based filtering/pagination/
 * sorting, and that the V6 migration's indexes actually exist on the H2 test schema
 * (migration/entity compatibility).
 */
@DataJpaTest
@ActiveProfiles("test")
class AuditRepositoryTest {

    @Autowired
    private AuditRepository auditRepository;

    @Autowired
    private EntityManager entityManager;

    @Test
    @DisplayName("findByRequestId returns the persisted row")
    void testFindByRequestId() {
        UUID requestId = UUID.randomUUID();
        auditRepository.save(sample(requestId, "agent-a", DecisionType.ALLOW, Instant.now()));

        Optional<AuditLog> found = auditRepository.findByRequestId(requestId);

        assertTrue(found.isPresent());
        assertEquals("agent-a", found.get().getAgentId());
    }

    @Test
    @DisplayName("findByRequestId returns empty for an unknown requestId")
    void testFindByRequestIdMissing() {
        assertTrue(auditRepository.findByRequestId(UUID.randomUUID()).isEmpty());
    }

    @Test
    @DisplayName("findAll(Specification, Pageable) combines filters and paginates")
    void testSpecificationFilteringAndPagination() {
        auditRepository.save(sample(UUID.randomUUID(), "agent-a", DecisionType.ALLOW, Instant.now()));
        auditRepository.save(sample(UUID.randomUUID(), "agent-b", DecisionType.ALLOW, Instant.now()));

        Specification<AuditLog> spec = AuditLogSpecifications.agentIdEquals("agent-a");
        Page<AuditLog> page = auditRepository.findAll(spec,
                PageRequest.of(0, 10, Sort.by(Sort.Direction.DESC, "timestamp")));

        assertEquals(1, page.getTotalElements());
        assertEquals("agent-a", page.getContent().get(0).getAgentId());
    }

    @Test
    @DisplayName("findAll(Specification, Pageable) sorts by timestamp DESC")
    void testSortingDescending() {
        Instant now = Instant.now();
        AuditLog older = auditRepository.save(sample(UUID.randomUUID(), "agent-a", DecisionType.ALLOW,
                now.minusSeconds(60)));
        AuditLog newer = auditRepository.save(sample(UUID.randomUUID(), "agent-a", DecisionType.ALLOW, now));

        Page<AuditLog> page = auditRepository.findAll(Specification.allOf(),
                PageRequest.of(0, 10, Sort.by(Sort.Direction.DESC, "timestamp")));

        assertEquals(newer.getRequestId(), page.getContent().get(0).getRequestId());
        assertEquals(older.getRequestId(), page.getContent().get(1).getRequestId());
    }

    @Test
    @DisplayName("V6 migration created the expected indexes on audit_logs")
    void testV6IndexesExist() {
        @SuppressWarnings("unchecked")
        List<String> indexNames = entityManager.createNativeQuery(
                        "SELECT INDEX_NAME FROM INFORMATION_SCHEMA.INDEXES WHERE UPPER(TABLE_NAME) = 'AUDIT_LOGS'")
                .getResultList();

        List<String> upper = indexNames.stream().map(String::toUpperCase).toList();
        assertTrue(upper.stream().anyMatch(n -> n.contains("REQUEST_ID")), "expected an index on request_id: " + upper);
        assertTrue(upper.stream().anyMatch(n -> n.contains("AGENT_ID")), "expected an index on agent_id: " + upper);
        assertTrue(upper.stream().anyMatch(n -> n.contains("TIMESTAMP")), "expected an index on timestamp: " + upper);
    }

    private AuditLog sample(UUID requestId, String agentId, DecisionType decision, Instant timestamp) {
        return AuditLog.builder()
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
                .authorizationResult(AuthorizationResult.AUTHORIZED)
                .authorizationReason("ok")
                .timestamp(timestamp)
                .build();
    }
}
