package com.agentshield.review;

import com.agentshield.model.ActionType;
import com.agentshield.model.DecisionType;
import com.agentshield.model.ResourceSensitivity;
import com.agentshield.model.ReviewStatus;
import com.agentshield.model.RiskTier;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.UUID;

/**
 * JPA entity for the Phase 3 human review workflow: one row per gateway request whose
 * final (post-escalation) decision is REVIEW.
 *
 * {@code requestId} correlates this row with the {@code audit_logs}/{@code risk_assessments}
 * rows for the same gateway evaluation (unique — at most one review request per request).
 * {@code originalDecision} is the PolicyEngine decision before risk escalation (ALLOW or
 * REVIEW; never DENY, since a DENY never reaches the review workflow). {@code riskScore}/
 * {@code riskTier} are the Risk Engine's own assessment (not PolicyEngine's static score),
 * so a reviewer sees one internally-consistent risk signal rather than the PolicyEngine/
 * Risk-Engine score split exposed on {@code EvaluationResponse}.
 */
@Entity
@Table(name = "review_requests")
public class ReviewRequest {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "request_id", nullable = false, unique = true)
    private UUID requestId;

    @Column(name = "agent_id", nullable = false)
    private String agentId;

    @Column(name = "session_id", nullable = false)
    private String sessionId;

    @Column(nullable = false)
    private String tool;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 30)
    private ActionType action;

    @Column(nullable = false, length = 1024)
    private String resource;

    @Enumerated(EnumType.STRING)
    @Column(name = "resource_sensitivity", nullable = false, length = 20)
    private ResourceSensitivity resourceSensitivity;

    @Column(name = "risk_score", nullable = false)
    private int riskScore;

    @Enumerated(EnumType.STRING)
    @Column(name = "risk_tier", nullable = false, length = 20)
    private RiskTier riskTier;

    @Enumerated(EnumType.STRING)
    @Column(name = "original_decision", nullable = false, length = 20)
    private DecisionType originalDecision;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private ReviewStatus status;

    @Column(length = 1000)
    private String reason;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    @Column(name = "reviewed_at")
    private Instant reviewedAt;

    public ReviewRequest() {
    }

    public ReviewRequest(UUID id, UUID requestId, String agentId, String sessionId, String tool, ActionType action,
                          String resource, ResourceSensitivity resourceSensitivity, int riskScore, RiskTier riskTier,
                          DecisionType originalDecision, ReviewStatus status, String reason, Instant createdAt,
                          Instant updatedAt, Instant reviewedAt) {
        this.id = id;
        this.requestId = requestId;
        this.agentId = agentId;
        this.sessionId = sessionId;
        this.tool = tool;
        this.action = action;
        this.resource = resource;
        this.resourceSensitivity = resourceSensitivity;
        this.riskScore = riskScore;
        this.riskTier = riskTier;
        this.originalDecision = originalDecision;
        this.status = status;
        this.reason = reason;
        this.createdAt = createdAt;
        this.updatedAt = updatedAt;
        this.reviewedAt = reviewedAt;
    }

    public UUID getId() {
        return id;
    }

    public void setId(UUID id) {
        this.id = id;
    }

    public UUID getRequestId() {
        return requestId;
    }

    public void setRequestId(UUID requestId) {
        this.requestId = requestId;
    }

    public String getAgentId() {
        return agentId;
    }

    public void setAgentId(String agentId) {
        this.agentId = agentId;
    }

    public String getSessionId() {
        return sessionId;
    }

    public void setSessionId(String sessionId) {
        this.sessionId = sessionId;
    }

    public String getTool() {
        return tool;
    }

    public void setTool(String tool) {
        this.tool = tool;
    }

    public ActionType getAction() {
        return action;
    }

    public void setAction(ActionType action) {
        this.action = action;
    }

    public String getResource() {
        return resource;
    }

    public void setResource(String resource) {
        this.resource = resource;
    }

    public ResourceSensitivity getResourceSensitivity() {
        return resourceSensitivity;
    }

    public void setResourceSensitivity(ResourceSensitivity resourceSensitivity) {
        this.resourceSensitivity = resourceSensitivity;
    }

    public int getRiskScore() {
        return riskScore;
    }

    public void setRiskScore(int riskScore) {
        this.riskScore = riskScore;
    }

    public RiskTier getRiskTier() {
        return riskTier;
    }

    public void setRiskTier(RiskTier riskTier) {
        this.riskTier = riskTier;
    }

    public DecisionType getOriginalDecision() {
        return originalDecision;
    }

    public void setOriginalDecision(DecisionType originalDecision) {
        this.originalDecision = originalDecision;
    }

    public ReviewStatus getStatus() {
        return status;
    }

    public void setStatus(ReviewStatus status) {
        this.status = status;
    }

    public String getReason() {
        return reason;
    }

    public void setReason(String reason) {
        this.reason = reason;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(Instant createdAt) {
        this.createdAt = createdAt;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }

    public void setUpdatedAt(Instant updatedAt) {
        this.updatedAt = updatedAt;
    }

    public Instant getReviewedAt() {
        return reviewedAt;
    }

    public void setReviewedAt(Instant reviewedAt) {
        this.reviewedAt = reviewedAt;
    }

    public static Builder builder() {
        return new Builder();
    }

    public static class Builder {
        private UUID id;
        private UUID requestId;
        private String agentId;
        private String sessionId;
        private String tool;
        private ActionType action;
        private String resource;
        private ResourceSensitivity resourceSensitivity;
        private int riskScore;
        private RiskTier riskTier;
        private DecisionType originalDecision;
        private ReviewStatus status;
        private String reason;
        private Instant createdAt;
        private Instant updatedAt;
        private Instant reviewedAt;

        public Builder id(UUID id) {
            this.id = id;
            return this;
        }

        public Builder requestId(UUID requestId) {
            this.requestId = requestId;
            return this;
        }

        public Builder agentId(String agentId) {
            this.agentId = agentId;
            return this;
        }

        public Builder sessionId(String sessionId) {
            this.sessionId = sessionId;
            return this;
        }

        public Builder tool(String tool) {
            this.tool = tool;
            return this;
        }

        public Builder action(ActionType action) {
            this.action = action;
            return this;
        }

        public Builder resource(String resource) {
            this.resource = resource;
            return this;
        }

        public Builder resourceSensitivity(ResourceSensitivity resourceSensitivity) {
            this.resourceSensitivity = resourceSensitivity;
            return this;
        }

        public Builder riskScore(int riskScore) {
            this.riskScore = riskScore;
            return this;
        }

        public Builder riskTier(RiskTier riskTier) {
            this.riskTier = riskTier;
            return this;
        }

        public Builder originalDecision(DecisionType originalDecision) {
            this.originalDecision = originalDecision;
            return this;
        }

        public Builder status(ReviewStatus status) {
            this.status = status;
            return this;
        }

        public Builder reason(String reason) {
            this.reason = reason;
            return this;
        }

        public Builder createdAt(Instant createdAt) {
            this.createdAt = createdAt;
            return this;
        }

        public Builder updatedAt(Instant updatedAt) {
            this.updatedAt = updatedAt;
            return this;
        }

        public Builder reviewedAt(Instant reviewedAt) {
            this.reviewedAt = reviewedAt;
            return this;
        }

        public ReviewRequest build() {
            return new ReviewRequest(id, requestId, agentId, sessionId, tool, action, resource, resourceSensitivity,
                    riskScore, riskTier, originalDecision, status, reason, createdAt, updatedAt, reviewedAt);
        }
    }
}
