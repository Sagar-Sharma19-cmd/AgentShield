package com.agentshield.review;

import com.agentshield.model.ReviewStatus;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * Spring Data JPA repository for ReviewRequest persistence.
 */
@Repository
public interface ReviewRequestRepository extends JpaRepository<ReviewRequest, UUID> {

    Optional<ReviewRequest> findByRequestId(UUID requestId);

    List<ReviewRequest> findByStatus(ReviewStatus status);

    /** A review visible to one verified agent: it must be that agent's own review. */
    Optional<ReviewRequest> findByIdAndRegisteredAgentId(UUID id, UUID registeredAgentId);

    /**
     * Atomically marks an approval as consumed. One conditional UPDATE: the row changes only if it
     * belongs to {@code agentId}, is APPROVED, has not expired and has not been consumed. The database
     * applies it under a row lock, so of two concurrent claims at most one sees an update count of 1.
     *
     * <p>Runs in its own transaction (or joins the caller's), so the claim commits on its own.
     *
     * @return 1 if this call claimed the approval, 0 otherwise
     */
    @Transactional
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("""
            UPDATE ReviewRequest r
               SET r.consumedAt = :now, r.updatedAt = :now
             WHERE r.id = :id
               AND r.registeredAgentId = :agentId
               AND r.status = com.agentshield.model.ReviewStatus.APPROVED
               AND r.consumedAt IS NULL
               AND r.expiresAt > :now
            """)
    int claimApproved(@Param("id") UUID id, @Param("agentId") UUID agentId, @Param("now") Instant now);
}
