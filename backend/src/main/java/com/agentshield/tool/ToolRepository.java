package com.agentshield.tool;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;
import java.util.UUID;

/**
 * Spring Data JPA repository for the tool registry.
 */
@Repository
public interface ToolRepository extends JpaRepository<Tool, UUID> {

    Optional<Tool> findByName(String name);

    boolean existsByName(String name);
}
