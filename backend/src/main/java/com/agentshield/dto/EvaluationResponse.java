package com.agentshield.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.agentshield.model.ActionType;
import com.agentshield.model.AuthorizationResult;
import com.agentshield.model.DecisionType;
import com.agentshield.model.RiskTier;

import java.time.Instant;
import java.util.UUID;

/**
 * Security evaluation decision response returned to the calling agent.
 *
 * {@code riskScore} is the PolicyEngine's own score and is unaffected by Risk Engine
 * integration. {@code riskTier}/{@code riskEngineAvailable} describe the (separate) Risk
 * Engine assessment that may have escalated {@code decision}; both are {@code null} when
 * the Risk Engine was not consulted (the request was already denied by authorization or
 * policy before the Risk Engine would have been called).
 *
 * {@code riskEngineScore} is the Risk Engine's score ({@code null} when it was not consulted),
 * {@code trajectoryScore} the session-history score ({@code null} when trajectory was not evaluated),
 * and {@code effectiveRiskScore} the highest of the policy, Risk Engine and trajectory scores: the
 * single number to show next to the final decision. {@code riskScore} keeps its original meaning.
 *
 * {@code reviewRequestId} is set only when the final {@code decision} is REVIEW (Phase 3
 * human review workflow); it is {@code null} for ALLOW and DENY, which never create a
 * review request.
 */
public class EvaluationResponse {

    private UUID requestId;
    private String agentId;
    private String sessionId;
    private ActionType action;
    private String resource;
    private DecisionType decision;
    private String reason;
    private int riskScore;
    private AuthorizationResult authorizationResult;
    private RiskTier riskTier;
    private Boolean riskEngineAvailable;
    private Integer riskEngineScore;
    private Integer trajectoryScore;
    private int effectiveRiskScore;
    private UUID reviewRequestId;
    private Instant timestamp;
    /**
     * One-time decision token (HS256 JWT), present only when the final decision is ALLOW. Redeem it at
     * POST /api/v1/gateway/decisions/redeem before running the operation. Omitted for REVIEW and DENY.
     */
    @JsonInclude(JsonInclude.Include.NON_NULL)
    private String decisionToken;

    public EvaluationResponse() {
    }

    public EvaluationResponse(UUID requestId, String agentId, String sessionId, ActionType action, String resource, DecisionType decision, String reason, int riskScore, AuthorizationResult authorizationResult, RiskTier riskTier, Boolean riskEngineAvailable, UUID reviewRequestId, Instant timestamp) {
        this.requestId = requestId;
        this.agentId = agentId;
        this.sessionId = sessionId;
        this.action = action;
        this.resource = resource;
        this.decision = decision;
        this.reason = reason;
        this.riskScore = riskScore;
        this.authorizationResult = authorizationResult;
        this.riskTier = riskTier;
        this.riskEngineAvailable = riskEngineAvailable;
        this.reviewRequestId = reviewRequestId;
        this.timestamp = timestamp;
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

    public DecisionType getDecision() {
        return decision;
    }

    public void setDecision(DecisionType decision) {
        this.decision = decision;
    }

    public String getReason() {
        return reason;
    }

    public void setReason(String reason) {
        this.reason = reason;
    }

    public int getRiskScore() {
        return riskScore;
    }

    public void setRiskScore(int riskScore) {
        this.riskScore = riskScore;
    }

    public AuthorizationResult getAuthorizationResult() {
        return authorizationResult;
    }

    public void setAuthorizationResult(AuthorizationResult authorizationResult) {
        this.authorizationResult = authorizationResult;
    }

    public RiskTier getRiskTier() {
        return riskTier;
    }

    public void setRiskTier(RiskTier riskTier) {
        this.riskTier = riskTier;
    }

    public Boolean getRiskEngineAvailable() {
        return riskEngineAvailable;
    }

    public void setRiskEngineAvailable(Boolean riskEngineAvailable) {
        this.riskEngineAvailable = riskEngineAvailable;
    }

    public UUID getReviewRequestId() {
        return reviewRequestId;
    }

    public void setReviewRequestId(UUID reviewRequestId) {
        this.reviewRequestId = reviewRequestId;
    }

    public Instant getTimestamp() {
        return timestamp;
    }

    public void setTimestamp(Instant timestamp) {
        this.timestamp = timestamp;
    }

    public Integer getRiskEngineScore() {
        return riskEngineScore;
    }

    public void setRiskEngineScore(Integer riskEngineScore) {
        this.riskEngineScore = riskEngineScore;
    }

    public Integer getTrajectoryScore() {
        return trajectoryScore;
    }

    public void setTrajectoryScore(Integer trajectoryScore) {
        this.trajectoryScore = trajectoryScore;
    }

    public String getDecisionToken() {
        return decisionToken;
    }

    public void setDecisionToken(String decisionToken) {
        this.decisionToken = decisionToken;
    }

    public int getEffectiveRiskScore() {
        return effectiveRiskScore;
    }

    public void setEffectiveRiskScore(int effectiveRiskScore) {
        this.effectiveRiskScore = effectiveRiskScore;
    }

    public static Builder builder() {
        return new Builder();
    }

    public static class Builder {
        private UUID requestId;
        private String agentId;
        private String sessionId;
        private ActionType action;
        private String resource;
        private DecisionType decision;
        private String reason;
        private int riskScore;
        private AuthorizationResult authorizationResult;
        private RiskTier riskTier;
        private Boolean riskEngineAvailable;
        private Integer riskEngineScore;
        private Integer trajectoryScore;
        private UUID reviewRequestId;
        private Instant timestamp;

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

        public Builder action(ActionType action) {
            this.action = action;
            return this;
        }

        public Builder resource(String resource) {
            this.resource = resource;
            return this;
        }

        public Builder decision(DecisionType decision) {
            this.decision = decision;
            return this;
        }

        public Builder reason(String reason) {
            this.reason = reason;
            return this;
        }

        public Builder riskScore(int riskScore) {
            this.riskScore = riskScore;
            return this;
        }

        public Builder authorizationResult(AuthorizationResult authorizationResult) {
            this.authorizationResult = authorizationResult;
            return this;
        }

        public Builder riskTier(RiskTier riskTier) {
            this.riskTier = riskTier;
            return this;
        }

        public Builder riskEngineAvailable(Boolean riskEngineAvailable) {
            this.riskEngineAvailable = riskEngineAvailable;
            return this;
        }

        public Builder reviewRequestId(UUID reviewRequestId) {
            this.reviewRequestId = reviewRequestId;
            return this;
        }

        public Builder timestamp(Instant timestamp) {
            this.timestamp = timestamp;
            return this;
        }

        public Builder riskEngineScore(Integer riskEngineScore) {
            this.riskEngineScore = riskEngineScore;
            return this;
        }

        public Builder trajectoryScore(Integer trajectoryScore) {
            this.trajectoryScore = trajectoryScore;
            return this;
        }

        /** effectiveRiskScore is derived: the highest of riskScore, riskEngineScore and trajectoryScore. */
        public EvaluationResponse build() {
            EvaluationResponse response = new EvaluationResponse(requestId, agentId, sessionId, action, resource,
                    decision, reason, riskScore, authorizationResult, riskTier, riskEngineAvailable, reviewRequestId,
                    timestamp);
            response.setRiskEngineScore(riskEngineScore);
            response.setTrajectoryScore(trajectoryScore);
            int effective = riskScore;
            if (riskEngineScore != null) {
                effective = Math.max(effective, riskEngineScore);
            }
            if (trajectoryScore != null) {
                effective = Math.max(effective, trajectoryScore);
            }
            response.setEffectiveRiskScore(effective);
            return response;
        }
    }
}
