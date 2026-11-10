package com.agentshield.dto;

import com.agentshield.model.ActionType;
import com.agentshield.model.ReviewStatus;
import com.agentshield.review.ReviewRequest;

import java.time.Instant;
import java.util.UUID;

/**
 * A review as its owning agent sees it (GET /api/v1/gateway/reviews/{id}). It carries the exact
 * operation under review, so the agent can check it matches what it intends to run, and the
 * reviewer's decision. Risk and trajectory internals are deliberately left out.
 */
public record AgentReviewResponse(
        UUID id,
        UUID requestId,
        ReviewStatus status,
        String reviewer,
        String note,
        Instant expiresAt,
        boolean expired,
        boolean consumed,
        String tool,
        ActionType action,
        String resource
) {
    public static AgentReviewResponse from(ReviewRequest r, Instant now) {
        return new AgentReviewResponse(r.getId(), r.getRequestId(), r.getStatus(), r.getReviewer(),
                r.getDecisionNote(), r.getExpiresAt(), r.isExpiredAt(now), r.getConsumedAt() != null, r.getTool(),
                r.getAction(), r.getResource());
    }
}
