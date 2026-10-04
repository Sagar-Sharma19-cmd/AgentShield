package com.agentshield.review;

import com.agentshield.dto.EvaluationRequest;
import com.agentshield.exception.InvalidReviewStateException;
import com.agentshield.exception.ResourceNotFoundException;
import com.agentshield.model.DecisionType;
import com.agentshield.model.ResourceSensitivity;
import com.agentshield.model.ReviewStatus;
import com.agentshield.model.RiskTier;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

/**
 * Service managing the Phase 3 human review workflow.
 *
 * Strict state machine: PENDING -&gt; IN_REVIEW -&gt; APPROVED | REJECTED. There is no
 * direct PENDING -&gt; APPROVED/REJECTED shortcut, and APPROVED/REJECTED are terminal
 * (immutable). This workflow only ever handles requests whose gateway decision is
 * already REVIEW; it has no ability to touch ALLOW or DENY decisions, so it can never
 * turn a DENY into an ALLOW (see {@code com.agentshield.gateway.GatewayService}).
 */
@Service
public class ReviewRequestService {

    private final ReviewRequestRepository reviewRequestRepository;

    @Autowired
    public ReviewRequestService(ReviewRequestRepository reviewRequestRepository) {
        this.reviewRequestRepository = reviewRequestRepository;
    }

    /**
     * Creates a PENDING review request for a gateway request whose final decision is REVIEW.
     * Idempotent on {@code requestId}: if a review request already exists for this requestId
     * (e.g. defensive re-processing), the existing row is returned rather than creating a
     * duplicate — {@code review_requests.request_id} is also DB-unique as a second guard.
     */
    @Transactional
    public ReviewRequest createReviewRequest(UUID requestId, EvaluationRequest request,
                                              ResourceSensitivity resourceSensitivity, int riskScore, RiskTier riskTier,
                                              DecisionType originalDecision, String reason, Instant timestamp) {
        return reviewRequestRepository.findByRequestId(requestId)
                .orElseGet(() -> {
                    ReviewRequest reviewRequest = ReviewRequest.builder()
                            .requestId(requestId)
                            .agentId(request.getAgentId())
                            .sessionId(request.getSessionId())
                            .tool(request.getTool())
                            .action(request.getAction())
                            .resource(request.getResource())
                            .resourceSensitivity(resourceSensitivity)
                            .riskScore(riskScore)
                            .riskTier(riskTier)
                            .originalDecision(originalDecision)
                            .status(ReviewStatus.PENDING)
                            .reason(reason)
                            .createdAt(timestamp)
                            .updatedAt(timestamp)
                            .build();
                    return reviewRequestRepository.save(reviewRequest);
                });
    }

    @Transactional(readOnly = true)
    public ReviewRequest getReviewRequest(UUID id) {
        return findReviewRequest(id);
    }

    @Transactional(readOnly = true)
    public List<ReviewRequest> listByStatus(ReviewStatus status) {
        return reviewRequestRepository.findByStatus(status);
    }

    /** PENDING -&gt; IN_REVIEW. */
    @Transactional
    public ReviewRequest startReview(UUID id) {
        ReviewRequest reviewRequest = findReviewRequest(id);
        transition(reviewRequest, ReviewStatus.PENDING, ReviewStatus.IN_REVIEW);
        reviewRequest.setUpdatedAt(Instant.now());
        return reviewRequestRepository.saveAndFlush(reviewRequest);
    }

    /** IN_REVIEW -&gt; APPROVED. Does not grant authorization by itself — see class Javadoc. */
    @Transactional
    public ReviewRequest approveReview(UUID id) {
        ReviewRequest reviewRequest = findReviewRequest(id);
        transition(reviewRequest, ReviewStatus.IN_REVIEW, ReviewStatus.APPROVED);
        Instant now = Instant.now();
        reviewRequest.setUpdatedAt(now);
        reviewRequest.setReviewedAt(now);
        return reviewRequestRepository.saveAndFlush(reviewRequest);
    }

    /** IN_REVIEW -&gt; REJECTED. */
    @Transactional
    public ReviewRequest rejectReview(UUID id) {
        ReviewRequest reviewRequest = findReviewRequest(id);
        transition(reviewRequest, ReviewStatus.IN_REVIEW, ReviewStatus.REJECTED);
        Instant now = Instant.now();
        reviewRequest.setUpdatedAt(now);
        reviewRequest.setReviewedAt(now);
        return reviewRequestRepository.saveAndFlush(reviewRequest);
    }

    private void transition(ReviewRequest reviewRequest, ReviewStatus expectedCurrent, ReviewStatus target) {
        if (reviewRequest.getStatus() != expectedCurrent) {
            throw new InvalidReviewStateException("Cannot move review request from " + reviewRequest.getStatus()
                    + " to " + target + " (requires current status " + expectedCurrent + ").");
        }
        reviewRequest.setStatus(target);
    }

    private ReviewRequest findReviewRequest(UUID id) {
        return reviewRequestRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Review request not found."));
    }
}
