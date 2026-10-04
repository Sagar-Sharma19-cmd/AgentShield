package com.agentshield.dto;

import com.agentshield.model.ActionType;
import com.agentshield.model.DecisionType;
import com.agentshield.model.ResourceSensitivity;
import com.agentshield.model.ReviewStatus;
import com.agentshield.model.RiskTier;
import com.agentshield.review.ReviewRequest;

import java.time.Instant;
import java.util.UUID;

/**
 * Review request returned by the human review workflow API.
 */
public record ReviewRequestResponse(
        UUID id,
        UUID requestId,
        String agentId,
        String sessionId,
        String tool,
        ActionType action,
        String resource,
        ResourceSensitivity resourceSensitivity,
        int riskScore,
        RiskTier riskTier,
        DecisionType originalDecision,
        ReviewStatus status,
        String reason,
        Instant createdAt,
        Instant updatedAt,
        Instant reviewedAt
) {
    public static ReviewRequestResponse from(ReviewRequest r) {
        return new ReviewRequestResponse(r.getId(), r.getRequestId(), r.getAgentId(), r.getSessionId(), r.getTool(),
                r.getAction(), r.getResource(), r.getResourceSensitivity(), r.getRiskScore(), r.getRiskTier(),
                r.getOriginalDecision(), r.getStatus(), r.getReason(), r.getCreatedAt(), r.getUpdatedAt(),
                r.getReviewedAt());
    }
}
