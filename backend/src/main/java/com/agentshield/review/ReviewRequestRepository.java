package com.agentshield.review;

import com.agentshield.model.ReviewStatus;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

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
}
