package com.agentshield.dto;

import com.agentshield.model.ActionType;
import com.agentshield.review.ReviewRequest;

import java.time.Instant;
import java.util.UUID;

/**
 * Result of a successful claim (POST /api/v1/gateway/reviews/{id}/claim): the one operation the agent
 * may now run, exactly as it was approved. Nothing else is authorized by a claim.
 */
public record ReviewClaimResponse(
        UUID reviewId,
        UUID requestId,
        String sessionId,
        String tool,
        ActionType action,
        String resource,
        String reviewer,
        Instant consumedAt,
        /** One-time decision token (src REVIEW_APPROVED) for the approved operation; redeem it before running. */
        String decisionToken
) {
    public static ReviewClaimResponse from(ReviewRequest r, String decisionToken) {
        return new ReviewClaimResponse(r.getId(), r.getRequestId(), r.getSessionId(), r.getTool(), r.getAction(),
                r.getResource(), r.getReviewer(), r.getConsumedAt(), decisionToken);
    }

    /** Never prints the decision token. */
    @Override
    public String toString() {
        return "ReviewClaimResponse[reviewId=" + reviewId + ", requestId=" + requestId + ", tool=" + tool
                + ", action=" + action + ", consumedAt=" + consumedAt + ", decisionToken=<redacted>]";
    }
}
