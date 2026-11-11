package com.agentshield.review;

import com.agentshield.dto.EvaluationRequest;
import com.agentshield.exception.ConflictException;
import com.agentshield.exception.InvalidReviewStateException;
import com.agentshield.exception.ResourceNotFoundException;
import com.agentshield.model.DecisionType;
import com.agentshield.model.EscalationSource;
import com.agentshield.model.ResourceSensitivity;
import com.agentshield.model.ReviewStatus;
import com.agentshield.model.RiskTier;
import com.agentshield.trajectory.TrajectoryEvaluation;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.dao.ConcurrencyFailureException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Duration;
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
 *
 * Closing the loop (Phase B3): every review expires {@code agentshield.review.ttl-minutes} after it is
 * created. Before then the owning agent (the verified registered agent, never the claimed agentId) can
 * read it and, once APPROVED, claim it exactly once. A claim returns the exact approved tool, action
 * and resource; it authorizes nothing else. Expired reviews cannot be started, decided or claimed.
 */
@Service
public class ReviewRequestService {

    private static final Logger log = LoggerFactory.getLogger(ReviewRequestService.class);

    private final ReviewRequestRepository reviewRequestRepository;
    private final Clock clock;
    private final Duration ttl;

    @Autowired
    public ReviewRequestService(ReviewRequestRepository reviewRequestRepository, Clock clock,
                                @Value("${agentshield.review.ttl-minutes:30}") long ttlMinutes) {
        if (ttlMinutes <= 0) {
            throw new IllegalArgumentException("agentshield.review.ttl-minutes must be positive.");
        }
        this.reviewRequestRepository = reviewRequestRepository;
        this.clock = clock;
        this.ttl = Duration.ofMinutes(ttlMinutes);
    }

    /** The service's notion of now, for response fields such as {@code expired}. */
    public Instant now() {
        return clock.instant();
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
        return createReviewRequest(requestId, request, resourceSensitivity, riskScore, riskTier, originalDecision,
                reason, timestamp, null, null);
    }

    /**
     * As above, plus the trajectory signal. {@code riskScore}/{@code riskTier} are the Risk Engine's
     * values. The stored risk_score/risk_tier are the EFFECTIVE values: the higher of the Risk Engine
     * and trajectory assessments. The Risk Engine's own record stays in risk_assessments. The
     * trajectory score, tier and reason are stored separately. A null trajectory means it was not
     * evaluated.
     */
    @Transactional
    public ReviewRequest createReviewRequest(UUID requestId, EvaluationRequest request,
                                              ResourceSensitivity resourceSensitivity, int riskScore, RiskTier riskTier,
                                              DecisionType originalDecision, String reason, Instant timestamp,
                                              TrajectoryEvaluation trajectory) {
        return createReviewRequest(requestId, request, resourceSensitivity, riskScore, riskTier, originalDecision,
                reason, timestamp, trajectory, null);
    }

    /**
     * As above, plus the verified registered agent id ({@code AuthorizationDecision.agentId()}). Only that
     * agent can later read or claim the review. The claimed {@code request.getAgentId()} is stored for
     * display only and is never used for ownership. expires_at = timestamp + the configured TTL.
     * escalated_by is not recorded (null) through this overload.
     */
    @Transactional
    public ReviewRequest createReviewRequest(UUID requestId, EvaluationRequest request,
                                              ResourceSensitivity resourceSensitivity, int riskScore, RiskTier riskTier,
                                              DecisionType originalDecision, String reason, Instant timestamp,
                                              TrajectoryEvaluation trajectory, UUID registeredAgentId) {
        return createReviewRequest(requestId, request, resourceSensitivity, riskScore, riskTier, originalDecision,
                reason, timestamp, trajectory, registeredAgentId, null);
    }

    /**
     * As above, plus the signal that sent the request to review: the same {@link EscalationSource} the
     * gateway writes to the audit row for this request (V11). It is stored as given; nothing here decides
     * or changes it. Null means not recorded.
     */
    @Transactional
    public ReviewRequest createReviewRequest(UUID requestId, EvaluationRequest request,
                                              ResourceSensitivity resourceSensitivity, int riskScore, RiskTier riskTier,
                                              DecisionType originalDecision, String reason, Instant timestamp,
                                              TrajectoryEvaluation trajectory, UUID registeredAgentId,
                                              EscalationSource escalatedBy) {
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
                            .riskScore(trajectory == null ? riskScore : Math.max(riskScore, trajectory.score()))
                            .riskTier(trajectory == null ? riskTier : higherTier(riskTier, trajectory.tier()))
                            .originalDecision(originalDecision)
                            .status(ReviewStatus.PENDING)
                            .reason(reason)
                            .trajectoryScore(trajectory == null ? null : trajectory.score())
                            .trajectoryTier(trajectory == null ? null : trajectory.tier())
                            .trajectoryReason(trajectory == null ? null : trajectory.reason())
                            .createdAt(timestamp)
                            .updatedAt(timestamp)
                            .registeredAgentId(registeredAgentId)
                            .escalatedBy(escalatedBy)
                            .expiresAt(timestamp.plus(ttl))
                            .build();
                    return reviewRequestRepository.save(reviewRequest);
                });
    }

    private static RiskTier higherTier(RiskTier a, RiskTier b) {
        return a.compareTo(b) >= 0 ? a : b;
    }

    @Transactional(readOnly = true)
    public ReviewRequest getReviewRequest(UUID id) {
        return findReviewRequest(id);
    }

    @Transactional(readOnly = true)
    public List<ReviewRequest> listByStatus(ReviewStatus status) {
        return reviewRequestRepository.findByStatus(status);
    }

    /** PENDING -&gt; IN_REVIEW. Refused with 409 once the review has expired. */
    @Transactional
    public ReviewRequest startReview(UUID id) {
        ReviewRequest reviewRequest = findReviewRequest(id);
        Instant now = clock.instant();
        requireNotExpired(reviewRequest, ReviewStatus.PENDING, now);
        transition(reviewRequest, ReviewStatus.PENDING, ReviewStatus.IN_REVIEW);
        reviewRequest.setUpdatedAt(now);
        return reviewRequestRepository.saveAndFlush(reviewRequest);
    }

    /**
     * IN_REVIEW -&gt; APPROVED, recording the reviewer and an optional note. Approval does not grant
     * anything by itself: the owning agent must claim it before it expires (see {@link #claimForAgent}).
     */
    @Transactional
    public ReviewRequest approveReview(UUID id, String reviewer, String note) {
        return decide(id, ReviewStatus.APPROVED, reviewer, note);
    }

    /** IN_REVIEW -&gt; REJECTED, recording the reviewer and the (required) note. */
    @Transactional
    public ReviewRequest rejectReview(UUID id, String reviewer, String note) {
        if (blankToNull(note) == null) {
            throw new IllegalArgumentException("A note is required to reject a review.");
        }
        return decide(id, ReviewStatus.REJECTED, reviewer, note);
    }

    private ReviewRequest decide(UUID id, ReviewStatus target, String reviewer, String note) {
        String name = blankToNull(reviewer);
        if (name == null) {
            throw new IllegalArgumentException("A reviewer is required.");
        }
        ReviewRequest reviewRequest = findReviewRequest(id);
        Instant now = clock.instant();
        requireNotExpired(reviewRequest, ReviewStatus.IN_REVIEW, now);
        transition(reviewRequest, ReviewStatus.IN_REVIEW, target);
        reviewRequest.setReviewer(name);
        reviewRequest.setDecisionNote(blankToNull(note));
        reviewRequest.setUpdatedAt(now);
        reviewRequest.setReviewedAt(now);
        return reviewRequestRepository.saveAndFlush(reviewRequest);
    }

    /**
     * The review as its owner sees it. Any other agent, an unknown id, and a review with no recorded
     * registered agent all get the same ResourceNotFoundException (404), so a review's existence is never
     * revealed to another agent.
     */
    @Transactional(readOnly = true)
    public ReviewRequest getForAgent(UUID id, UUID agentId) {
        if (agentId == null) {
            throw notFound();
        }
        return reviewRequestRepository.findByIdAndRegisteredAgentId(id, agentId).orElseThrow(ReviewRequestService::notFound);
    }

    /**
     * Claims an approval for its owning agent, exactly once. The claim is one conditional UPDATE (see
     * {@link ReviewRequestRepository#claimApproved}), so two concurrent claims cannot both succeed. The
     * returned row carries the exact approved tool, action and resource.
     *
     * @throws ResourceNotFoundException (404) when the review does not exist or belongs to another agent
     * @throws ConflictException (409) when it is not APPROVED, has expired, or was already claimed
     */
    public ReviewRequest claimForAgent(UUID id, UUID agentId) {
        Instant now = clock.instant();
        int updated;
        try {
            updated = agentId == null ? 0 : reviewRequestRepository.claimApproved(id, agentId, now);
        } catch (ConcurrencyFailureException e) {
            // Some databases report a concurrent write on the same row as an error rather than waiting.
            // The other claim won (or will); this one did not.
            log.info("Concurrent claim on review request {} lost the race.", id);
            updated = 0;
        }
        ReviewRequest reviewRequest = getForAgent(id, agentId);
        if (updated == 1) {
            log.info("Review request {} claimed by its agent.", id);
            return reviewRequest;
        }
        throw new ConflictException(claimRefusal(reviewRequest, now));
    }

    private static String claimRefusal(ReviewRequest r, Instant now) {
        if (r.getConsumedAt() != null) {
            return "This approval was already claimed at " + r.getConsumedAt() + ". An approval can be used once.";
        }
        if (r.getStatus() != ReviewStatus.APPROVED) {
            return "Review request is " + r.getStatus() + ". Only an APPROVED review can be claimed.";
        }
        if (r.isExpiredAt(now)) {
            return "Review request expired at " + r.getExpiresAt() + ". Submit the request to the gateway again.";
        }
        return "Review request cannot be claimed.";
    }

    /** Applies only while the review is in {@code openStatus}; terminal states keep their own transition error. */
    private static void requireNotExpired(ReviewRequest r, ReviewStatus openStatus, Instant now) {
        if (r.getStatus() == openStatus && r.isExpiredAt(now)) {
            throw new ConflictException("Review request expired at " + r.getExpiresAt()
                    + ". It can no longer be started, approved or rejected; the agent must submit the request again.");
        }
    }

    private static String blankToNull(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }

    private static ResourceNotFoundException notFound() {
        return new ResourceNotFoundException("Review request not found.");
    }

    private void transition(ReviewRequest reviewRequest, ReviewStatus expectedCurrent, ReviewStatus target) {
        if (reviewRequest.getStatus() != expectedCurrent) {
            throw new InvalidReviewStateException("Cannot move review request from " + reviewRequest.getStatus()
                    + " to " + target + " (requires current status " + expectedCurrent + ").");
        }
        reviewRequest.setStatus(target);
    }

    private ReviewRequest findReviewRequest(UUID id) {
        return reviewRequestRepository.findById(id).orElseThrow(ReviewRequestService::notFound);
    }
}
