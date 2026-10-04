package com.agentshield.audit;

import com.agentshield.model.AuthorizationResult;
import com.agentshield.model.DecisionType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * Spring Data JPA repository for AuditLog persistence.
 *
 * JpaSpecificationExecutor backs the Audit Read API's list endpoint, which combines
 * several optional filters (agentId, decision, authorizationResult, timestamp range) —
 * see AuditLogSpecifications. This avoids a combinatorial explosion of derived
 * findByXAndYAndZ... method names for filters that may or may not be present.
 */
@Repository
public interface AuditRepository extends JpaRepository<AuditLog, UUID>, JpaSpecificationExecutor<AuditLog> {

    List<AuditLog> findByAgentId(String agentId);

    List<AuditLog> findBySessionId(String sessionId);

    List<AuditLog> findByDecision(DecisionType decision);

    List<AuditLog> findByAuthorizationResult(AuthorizationResult authorizationResult);

    /** One audit row is written per gateway request — see GatewayService.evaluateRequest. */
    Optional<AuditLog> findByRequestId(UUID requestId);
}
