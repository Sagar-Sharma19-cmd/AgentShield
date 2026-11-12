package com.agentshield.dto;

import com.agentshield.inspection.Finding;

import com.agentshield.model.ActionType;
import com.agentshield.model.DecisionType;
import com.agentshield.model.EscalationSource;
import com.agentshield.model.ResourceSensitivity;
import com.agentshield.model.ReviewStatus;
import com.agentshield.model.RiskTier;
import com.agentshield.review.ReviewRequest;

import java.time.Instant;
import java.util.List;
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
        Instant reviewedAt,
        /** Trajectory signal alone; null when trajectory analysis did not run. riskScore/riskTier are the effective values. */
        Integer trajectoryScore,
        RiskTier trajectoryTier,
        String trajectoryReason,
        /** Who approved or rejected it, as typed by the operator; null until decided. */
        String reviewer,
        /** Reviewer's note; null until decided (and optional on approve). */
        String note,
        Instant expiresAt,
        /** Computed when the response is built: true at or after expiresAt. */
        boolean expired,
        /** When the owning agent claimed the approval; null if not claimed. */
        Instant consumedAt,
        /**
         * Which signal sent the request to review, as on the audit row: NONE (policy), RISK_ENGINE or
         * TRAJECTORY. Null when not recorded (reviews created before V11 without an attributed audit row).
         */
        EscalationSource escalatedBy,
        /** Redacted content findings of the request (V13); null when inspection did not run. Never raw values. */
        List<Finding> inspectionFindings
) {
    public static ReviewRequestResponse from(ReviewRequest r, Instant now) {
        return new ReviewRequestResponse(r.getId(), r.getRequestId(), r.getAgentId(), r.getSessionId(), r.getTool(),
                r.getAction(), r.getResource(), r.getResourceSensitivity(), r.getRiskScore(), r.getRiskTier(),
                r.getOriginalDecision(), r.getStatus(), r.getReason(), r.getCreatedAt(), r.getUpdatedAt(),
                r.getReviewedAt(), r.getTrajectoryScore(), r.getTrajectoryTier(), r.getTrajectoryReason(),
                r.getReviewer(), r.getDecisionNote(), r.getExpiresAt(), r.isExpiredAt(now), r.getConsumedAt(),
                r.getEscalatedBy(), r.getInspectionFindings());
    }
}
