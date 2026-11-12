package com.agentshield.review;

import com.agentshield.enforcement.DecisionSource;
import com.agentshield.enforcement.DecisionTokenService;
import com.agentshield.dto.AgentReviewResponse;
import com.agentshield.dto.ReviewClaimResponse;
import com.agentshield.security.AuthenticatedAgent;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

/**
 * Agent-facing side of the human review loop, under {@code /api/v1/gateway/**} so it reuses the
 * existing gateway security chain (agent API key, ROLE_AGENT). No new authentication is introduced.
 *
 * Ownership is the authenticated principal's registered agent id. A review belonging to another agent
 * is reported as 404, exactly like an unknown id, so its existence is not revealed.
 */
@RestController
@RequestMapping("/api/v1/gateway/reviews")
public class AgentReviewController {

    private final ReviewRequestService reviewRequestService;
    private final DecisionTokenService decisionTokenService;

    @Autowired
    public AgentReviewController(ReviewRequestService reviewRequestService, DecisionTokenService decisionTokenService) {
        this.reviewRequestService = reviewRequestService;
        this.decisionTokenService = decisionTokenService;
    }

    /** 200 for the owning agent; 404 for an unknown id or another agent's review. */
    @GetMapping("/{id}")
    public ResponseEntity<AgentReviewResponse> getReview(@PathVariable UUID id,
                                                         @AuthenticationPrincipal AuthenticatedAgent caller) {
        ReviewRequest review = reviewRequestService.getForAgent(id, caller.id());
        return ResponseEntity.ok(AgentReviewResponse.from(review, reviewRequestService.now()));
    }

    /**
     * Claims an approval once. 200 with the exact approved tool/action/resource and a one-time decision token
     * (src REVIEW_APPROVED, jti = the original requestId) issued only after the claim committed; 409 when the
     * review is not APPROVED, has expired or was already claimed; 404 for an unknown id or another agent's review.
     * When the original request had arguments, the token carries their hash (V13), so the redeem must send the
     * same arguments.
     */
    @PostMapping("/{id}/claim")
    public ResponseEntity<ReviewClaimResponse> claim(@PathVariable UUID id,
                                                     @AuthenticationPrincipal AuthenticatedAgent caller) {
        ReviewRequest claimed = reviewRequestService.claimForAgent(id, caller.id());
        String token = decisionTokenService.issue(claimed.getRequestId(), caller.id(), claimed.getTool(),
                claimed.getAction(), claimed.getResource(), DecisionSource.REVIEW_APPROVED, claimed.getArgsSha256());
        return ResponseEntity.ok(ReviewClaimResponse.from(claimed, token));
    }
}
