package com.agentshield.dto;

import com.agentshield.model.ActionType;
import com.agentshield.model.AuthorizationResult;
import com.agentshield.model.DecisionType;

import java.time.Instant;
import java.util.UUID;

/**
 * Security evaluation decision response returned to the calling agent.
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
    private Instant timestamp;

    public EvaluationResponse() {
    }

    public EvaluationResponse(UUID requestId, String agentId, String sessionId, ActionType action, String resource, DecisionType decision, String reason, int riskScore, AuthorizationResult authorizationResult, Instant timestamp) {
        this.requestId = requestId;
        this.agentId = agentId;
        this.sessionId = sessionId;
        this.action = action;
        this.resource = resource;
        this.decision = decision;
        this.reason = reason;
        this.riskScore = riskScore;
        this.authorizationResult = authorizationResult;
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

    public Instant getTimestamp() {
        return timestamp;
    }

    public void setTimestamp(Instant timestamp) {
        this.timestamp = timestamp;
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

        public Builder timestamp(Instant timestamp) {
            this.timestamp = timestamp;
            return this;
        }

        public EvaluationResponse build() {
            return new EvaluationResponse(requestId, agentId, sessionId, action, resource, decision, reason, riskScore, authorizationResult, timestamp);
        }
    }
}
