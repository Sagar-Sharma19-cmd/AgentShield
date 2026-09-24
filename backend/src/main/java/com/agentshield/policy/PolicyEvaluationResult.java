package com.agentshield.policy;

import com.agentshield.model.DecisionType;
import com.agentshield.model.ResourceSensitivity;

/**
 * Result produced by PolicyEngine evaluation.
 */
public class PolicyEvaluationResult {

    private DecisionType decision;
    private String reason;
    private int riskScore;
    private ResourceSensitivity resourceSensitivity;

    public PolicyEvaluationResult() {
    }

    public PolicyEvaluationResult(DecisionType decision, String reason, int riskScore, ResourceSensitivity resourceSensitivity) {
        this.decision = decision;
        this.reason = reason;
        this.riskScore = riskScore;
        this.resourceSensitivity = resourceSensitivity;
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

    public ResourceSensitivity getResourceSensitivity() {
        return resourceSensitivity;
    }

    public void setResourceSensitivity(ResourceSensitivity resourceSensitivity) {
        this.resourceSensitivity = resourceSensitivity;
    }

    public static Builder builder() {
        return new Builder();
    }

    public static class Builder {
        private DecisionType decision;
        private String reason;
        private int riskScore;
        private ResourceSensitivity resourceSensitivity;

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

        public Builder resourceSensitivity(ResourceSensitivity resourceSensitivity) {
            this.resourceSensitivity = resourceSensitivity;
            return this;
        }

        public PolicyEvaluationResult build() {
            return new PolicyEvaluationResult(decision, reason, riskScore, resourceSensitivity);
        }
    }
}
