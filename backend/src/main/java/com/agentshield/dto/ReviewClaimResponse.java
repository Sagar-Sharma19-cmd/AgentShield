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
        Instant consumedAt
) {
    public static ReviewClaimResponse from(ReviewRequest r) {
        return new ReviewClaimResponse(r.getId(), r.getRequestId(), r.getSessionId(), r.getTool(), r.getAction(),
                r.getResource(), r.getReviewer(), r.getConsumedAt());
    }
}
