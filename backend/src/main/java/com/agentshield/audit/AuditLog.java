package com.agentshield.audit;

import com.agentshield.model.ActionOutcome;
import com.agentshield.model.ActionType;
import com.agentshield.model.AuthorizationResult;
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
 *
 * Identity/authorization columns (registeredAgentId, registeredToolId, authorizationResult,
 * authorizationReason) are nullable so audit rows written before agent identity existed remain valid.
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

    /** Resolved registered agent id; null when the requesting agent is not registered. */
    private UUID registeredAgentId;

    /** Resolved registered tool id; null when the tool is not registered or was not checked. */
    private UUID registeredToolId;

    @Enumerated(EnumType.STRING)
    @Column(length = 30)
    private AuthorizationResult authorizationResult;

    @Column(length = 1000)
    private String authorizationReason;

    @Column(nullable = false, updatable = false)
    private Instant timestamp;

    public AuditLog() {
    }

    public AuditLog(UUID id, UUID requestId, String agentId, String sessionId, String tool, ActionType action, String resource, ResourceSensitivity resourceSensitivity, DecisionType decision, int riskScore, String reason, ActionOutcome actionOutcome, UUID registeredAgentId, UUID registeredToolId, AuthorizationResult authorizationResult, String authorizationReason, Instant timestamp) {
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
        this.registeredAgentId = registeredAgentId;
        this.registeredToolId = registeredToolId;
        this.authorizationResult = authorizationResult;
        this.authorizationReason = authorizationReason;
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

    public UUID getRegisteredAgentId() {
        return registeredAgentId;
    }

    public void setRegisteredAgentId(UUID registeredAgentId) {
        this.registeredAgentId = registeredAgentId;
    }

    public UUID getRegisteredToolId() {
        return registeredToolId;
    }

    public void setRegisteredToolId(UUID registeredToolId) {
        this.registeredToolId = registeredToolId;
    }

    public AuthorizationResult getAuthorizationResult() {
        return authorizationResult;
    }

    public void setAuthorizationResult(AuthorizationResult authorizationResult) {
        this.authorizationResult = authorizationResult;
    }

    public String getAuthorizationReason() {
        return authorizationReason;
    }

    public void setAuthorizationReason(String authorizationReason) {
        this.authorizationReason = authorizationReason;
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
        private UUID registeredAgentId;
        private UUID registeredToolId;
        private AuthorizationResult authorizationResult;
        private String authorizationReason;
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

        public Builder registeredAgentId(UUID registeredAgentId) {
            this.registeredAgentId = registeredAgentId;
            return this;
        }

        public Builder registeredToolId(UUID registeredToolId) {
            this.registeredToolId = registeredToolId;
            return this;
        }

        public Builder authorizationResult(AuthorizationResult authorizationResult) {
            this.authorizationResult = authorizationResult;
            return this;
        }

        public Builder authorizationReason(String authorizationReason) {
            this.authorizationReason = authorizationReason;
            return this;
        }

        public Builder timestamp(Instant timestamp) {
            this.timestamp = timestamp;
            return this;
        }

        public AuditLog build() {
            return new AuditLog(id, requestId, agentId, sessionId, tool, action, resource, resourceSensitivity, decision, riskScore, reason, actionOutcome, registeredAgentId, registeredToolId, authorizationResult, authorizationReason, timestamp);
        }
    }
}
