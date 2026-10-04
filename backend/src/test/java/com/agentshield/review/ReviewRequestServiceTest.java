package com.agentshield.review;

import com.agentshield.dto.EvaluationRequest;
import com.agentshield.exception.InvalidReviewStateException;
import com.agentshield.exception.ResourceNotFoundException;
import com.agentshield.model.ActionType;
import com.agentshield.model.DecisionType;
import com.agentshield.model.ResourceSensitivity;
import com.agentshield.model.ReviewStatus;
import com.agentshield.model.RiskTier;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.ActiveProfiles;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Phase 3 — ReviewRequestService: creation/idempotency (persistence + requestId
 * correlation, covering test categories A and B), and the strict state machine.
 */
@DataJpaTest
@Import(ReviewRequestService.class)
@ActiveProfiles("test")
class ReviewRequestServiceTest {

    @Autowired
    private ReviewRequestService reviewRequestService;

    @Autowired
    private ReviewRequestRepository reviewRequestRepository;

    @Test
    @DisplayName("A. createReviewRequest persists a PENDING row with the given requestId and risk data")
    void testCreateReviewRequestPersistsPending() {
        UUID requestId = UUID.randomUUID();
        Instant now = Instant.now();

        ReviewRequest created = reviewRequestService.createReviewRequest(requestId, request(), ResourceSensitivity.SENSITIVE,
                42, RiskTier.HIGH, DecisionType.ALLOW, "Escalated to REVIEW by Risk Engine assessment (HIGH).", now);

        assertNotNull(created.getId());
        assertEquals(requestId, created.getRequestId());
        assertEquals(ReviewStatus.PENDING, created.getStatus());
        assertEquals(42, created.getRiskScore());
        assertEquals(RiskTier.HIGH, created.getRiskTier());
        assertEquals(DecisionType.ALLOW, created.getOriginalDecision());
        assertNull(created.getReviewedAt());
    }

    @Test
    @DisplayName("B. requestId correlation: findByRequestId returns the persisted review request")
    void testRequestIdCorrelation() {
        UUID requestId = UUID.randomUUID();
        reviewRequestService.createReviewRequest(requestId, request(), ResourceSensitivity.INTERNAL,
                10, RiskTier.LOW, DecisionType.REVIEW, "reason", Instant.now());

        assertTrue(reviewRequestRepository.findByRequestId(requestId).isPresent());
        assertEquals(requestId, reviewRequestRepository.findByRequestId(requestId).get().getRequestId());
    }

    @Test
    @DisplayName("Duplicate processing: creating a review request twice for the same requestId does not duplicate")
    void testDuplicateRequestIdDoesNotCreateDuplicate() {
        UUID requestId = UUID.randomUUID();
        ReviewRequest first = reviewRequestService.createReviewRequest(requestId, request(), ResourceSensitivity.INTERNAL,
                10, RiskTier.LOW, DecisionType.REVIEW, "reason", Instant.now());
        ReviewRequest second = reviewRequestService.createReviewRequest(requestId, request(), ResourceSensitivity.INTERNAL,
                10, RiskTier.LOW, DecisionType.REVIEW, "reason", Instant.now());

        assertEquals(first.getId(), second.getId());
        assertEquals(1, reviewRequestRepository.findAll().size());
    }

    @Test
    @DisplayName("PENDING -> IN_REVIEW")
    void testStartReview() {
        UUID id = create().getId();

        ReviewRequest started = reviewRequestService.startReview(id);

        assertEquals(ReviewStatus.IN_REVIEW, started.getStatus());
    }

    @Test
    @DisplayName("IN_REVIEW -> APPROVED, sets reviewedAt")
    void testApproveReview() {
        UUID id = create().getId();
        reviewRequestService.startReview(id);

        ReviewRequest approved = reviewRequestService.approveReview(id);

        assertEquals(ReviewStatus.APPROVED, approved.getStatus());
        assertNotNull(approved.getReviewedAt());
    }

    @Test
    @DisplayName("IN_REVIEW -> REJECTED, sets reviewedAt")
    void testRejectReview() {
        UUID id = create().getId();
        reviewRequestService.startReview(id);

        ReviewRequest rejected = reviewRequestService.rejectReview(id);

        assertEquals(ReviewStatus.REJECTED, rejected.getStatus());
        assertNotNull(rejected.getReviewedAt());
    }

    @Test
    @DisplayName("Invalid transition: PENDING -> APPROVED directly is rejected (strict workflow)")
    void testPendingToApprovedDirectlyIsInvalid() {
        UUID id = create().getId();

        assertThrows(InvalidReviewStateException.class, () -> reviewRequestService.approveReview(id));
    }

    @Test
    @DisplayName("Invalid transition: PENDING -> REJECTED directly is rejected (strict workflow)")
    void testPendingToRejectedDirectlyIsInvalid() {
        UUID id = create().getId();

        assertThrows(InvalidReviewStateException.class, () -> reviewRequestService.rejectReview(id));
    }

    @Test
    @DisplayName("Invalid transition: starting an already IN_REVIEW request again fails")
    void testStartingTwiceIsInvalid() {
        UUID id = create().getId();
        reviewRequestService.startReview(id);

        assertThrows(InvalidReviewStateException.class, () -> reviewRequestService.startReview(id));
    }

    @Test
    @DisplayName("Terminal state: APPROVED cannot be approved, rejected, or restarted again")
    void testApprovedIsImmutable() {
        UUID id = create().getId();
        reviewRequestService.startReview(id);
        reviewRequestService.approveReview(id);

        assertThrows(InvalidReviewStateException.class, () -> reviewRequestService.approveReview(id));
        assertThrows(InvalidReviewStateException.class, () -> reviewRequestService.rejectReview(id));
        assertThrows(InvalidReviewStateException.class, () -> reviewRequestService.startReview(id));
    }

    @Test
    @DisplayName("Terminal state: REJECTED cannot be approved, rejected, or restarted again")
    void testRejectedIsImmutable() {
        UUID id = create().getId();
        reviewRequestService.startReview(id);
        reviewRequestService.rejectReview(id);

        assertThrows(InvalidReviewStateException.class, () -> reviewRequestService.approveReview(id));
        assertThrows(InvalidReviewStateException.class, () -> reviewRequestService.rejectReview(id));
        assertThrows(InvalidReviewStateException.class, () -> reviewRequestService.startReview(id));
    }

    @Test
    @DisplayName("getReviewRequest throws ResourceNotFoundException for an unknown id")
    void testGetReviewRequestNotFound() {
        assertThrows(ResourceNotFoundException.class, () -> reviewRequestService.getReviewRequest(UUID.randomUUID()));
    }

    @Test
    @DisplayName("listByStatus returns only review requests in the requested status")
    void testListByStatus() {
        ReviewRequest pending = create();
        ReviewRequest other = create();
        reviewRequestService.startReview(other.getId());

        List<ReviewRequest> pendingList = reviewRequestService.listByStatus(ReviewStatus.PENDING);
        List<ReviewRequest> inReviewList = reviewRequestService.listByStatus(ReviewStatus.IN_REVIEW);

        assertEquals(1, pendingList.size());
        assertEquals(pending.getId(), pendingList.get(0).getId());
        assertEquals(1, inReviewList.size());
        assertEquals(other.getId(), inReviewList.get(0).getId());
    }

    private ReviewRequest create() {
        return reviewRequestService.createReviewRequest(UUID.randomUUID(), request(), ResourceSensitivity.SENSITIVE,
                50, RiskTier.HIGH, DecisionType.REVIEW, "DELETE action requires human review.", Instant.now());
    }

    private EvaluationRequest request() {
        return EvaluationRequest.builder()
                .agentId("research-agent")
                .sessionId("session-1")
                .action(ActionType.DELETE)
                .resource("dev/temp-file.log")
                .tool("filesystem")
                .build();
    }
}
