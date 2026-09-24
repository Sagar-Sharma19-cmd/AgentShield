package com.agentshield.audit;

import com.agentshield.model.ActionOutcome;
import com.agentshield.model.ActionType;
import com.agentshield.model.DecisionType;
import com.agentshield.model.ResourceSensitivity;
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
 * JPA Entity storing audit records of all gateway evaluation decisions.
 */
@Entity
@Table(name = "audit_logs")
public class AuditLog {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(nullable = false)
    private UUID requestId;

    @Column(nullable = false)
    private String agentId;

    @Column(nullable = false)
    private String sessionId;

    @Column(nullable = false)
    private String tool;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private ActionType action;

    @Column(nullable = false, length = 1024)
    private String resource;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private ResourceSensitivity resourceSensitivity;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private DecisionType decision;

    @Column(nullable = false)
    private int riskScore;

    @Column(length = 1000)
    private String reason;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private ActionOutcome actionOutcome;

    @Column(nullable = false, updatable = false)
    private Instant timestamp;

    public AuditLog() {
    }

    public AuditLog(UUID id, UUID requestId, String agentId, String sessionId, String tool, ActionType action, String resource, ResourceSensitivity resourceSensitivity, DecisionType decision, int riskScore, String reason, ActionOutcome actionOutcome, Instant timestamp) {
        this.id = id;
        this.requestId = requestId;
        this.agentId = agentId;
        this.sessionId = sessionId;
        this.tool = tool;
        this.action = action;
        this.resource = resource;
        this.resourceSensitivity = resourceSensitivity;
        this.decision = decision;
        this.riskScore = riskScore;
        this.reason = reason;
        this.actionOutcome = actionOutcome;
        this.timestamp = timestamp;
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

    public DecisionType getDecision() {
        return decision;
    }

    public void setDecision(DecisionType decision) {
        this.decision = decision;
    }

    public int getRiskScore() {
        return riskScore;
    }

    public void setRiskScore(int riskScore) {
        this.riskScore = riskScore;
    }

    public String getReason() {
        return reason;
    }

    public void setReason(String reason) {
        this.reason = reason;
    }

    public ActionOutcome getActionOutcome() {
        return actionOutcome;
    }

    public void setActionOutcome(ActionOutcome actionOutcome) {
        this.actionOutcome = actionOutcome;
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
        private UUID id;
        private UUID requestId;
        private String agentId;
        private String sessionId;
        private String tool;
        private ActionType action;
        private String resource;
        private ResourceSensitivity resourceSensitivity;
        private DecisionType decision;
        private int riskScore;
        private String reason;
        private ActionOutcome actionOutcome;
        private Instant timestamp;

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

        public Builder decision(DecisionType decision) {
            this.decision = decision;
            return this;
        }

        public Builder riskScore(int riskScore) {
            this.riskScore = riskScore;
            return this;
        }

        public Builder reason(String reason) {
            this.reason = reason;
            return this;
        }

        public Builder actionOutcome(ActionOutcome actionOutcome) {
            this.actionOutcome = actionOutcome;
            return this;
        }

        public Builder timestamp(Instant timestamp) {
            this.timestamp = timestamp;
            return this;
        }

        public AuditLog build() {
            return new AuditLog(id, requestId, agentId, sessionId, tool, action, resource, resourceSensitivity, decision, riskScore, reason, actionOutcome, timestamp);
        }
    }
}
