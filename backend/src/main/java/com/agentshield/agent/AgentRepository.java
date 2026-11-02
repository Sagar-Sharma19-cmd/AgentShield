package com.agentshield.agent;

import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
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

    /**
     * Loads one agent with a PostgreSQL row lock (Hibernate emits SELECT ... FOR NO KEY UPDATE for
     * PESSIMISTIC_WRITE). Used by lifecycle writes so that concurrent status changes and key rotations on
     * the same agent run one after another. The lock is held until the enclosing transaction commits or
     * rolls back.
     *
     * <p>Isolation assumption: this relies on PostgreSQL READ COMMITTED, the server and JDBC default. Under
     * READ COMMITTED, a statement that waits for the lock re-reads the committed row once the lock is
     * released, so the lifecycle checks see the other transaction's result. The application does not set
     * isolation globally. Under REPEATABLE READ or SERIALIZABLE, the same statement can fail with a
     * serialization error instead; that error is not mapped and would surface as a generic 500.
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select a from Agent a where a.id = :id")
    Optional<Agent> findByIdForUpdate(@Param("id") UUID id);
}
