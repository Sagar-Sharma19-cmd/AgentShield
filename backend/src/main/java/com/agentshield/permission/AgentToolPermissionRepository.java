package com.agentshield.permission;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * Spring Data JPA repository for agent-tool permission grants.
 */
@Repository
public interface AgentToolPermissionRepository extends JpaRepository<AgentToolPermission, UUID> {

    Optional<AgentToolPermission> findByAgentIdAndToolId(UUID agentId, UUID toolId);

    List<AgentToolPermission> findByAgentId(UUID agentId);

    boolean existsByAgentIdAndToolId(UUID agentId, UUID toolId);
}
