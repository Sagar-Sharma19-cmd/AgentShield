package com.agentshield.audit;

import com.agentshield.model.AuthorizationResult;
import com.agentshield.model.DecisionType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.UUID;

/**
 * Spring Data JPA repository for AuditLog persistence.
 */
@Repository
public interface AuditRepository extends JpaRepository<AuditLog, UUID> {

    List<AuditLog> findByAgentId(String agentId);

    List<AuditLog> findBySessionId(String sessionId);

    List<AuditLog> findByDecision(DecisionType decision);

    List<AuditLog> findByAuthorizationResult(AuthorizationResult authorizationResult);
}
