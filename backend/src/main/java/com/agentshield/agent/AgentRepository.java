package com.agentshield.agent;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;
import java.util.UUID;

/**
 * Spring Data JPA repository for registered agents.
 */
@Repository
public interface AgentRepository extends JpaRepository<Agent, UUID> {

    Optional<Agent> findByName(String name);

    boolean existsByName(String name);

    Optional<Agent> findByApiKeyHash(String apiKeyHash);
}
