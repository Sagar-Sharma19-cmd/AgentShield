package com.agentshield.dto;

import com.agentshield.model.ActionType;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

import java.util.Map;

/**
 * Incoming request payload submitted by an AI agent for security evaluation.
 */
public class EvaluationRequest {

    @NotBlank(message = "agentId is required")
    private String agentId;

    @NotBlank(message = "sessionId is required")
    private String sessionId;

    @NotNull(message = "action is required")
    private ActionType action;

    @NotBlank(message = "resource is required")
    private String resource;

    @NotBlank(message = "tool is required")
    private String tool;

    private Map<String, Object> metadata;

    public EvaluationRequest() {
    }

    public EvaluationRequest(String agentId, String sessionId, ActionType action, String resource, String tool, Map<String, Object> metadata) {
        this.agentId = agentId;
        this.sessionId = sessionId;
        this.action = action;
        this.resource = resource;
        this.tool = tool;
        this.metadata = metadata;
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

    public String getTool() {
        return tool;
    }

    public void setTool(String tool) {
        this.tool = tool;
    }

    public Map<String, Object> getMetadata() {
        return metadata;
    }

    public void setMetadata(Map<String, Object> metadata) {
        this.metadata = metadata;
    }

    public static Builder builder() {
        return new Builder();
    }

    public static class Builder {
        private String agentId;
        private String sessionId;
        private ActionType action;
        private String resource;
        private String tool;
        private Map<String, Object> metadata;

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

        public Builder tool(String tool) {
            this.tool = tool;
            return this;
        }

        public Builder metadata(Map<String, Object> metadata) {
            this.metadata = metadata;
            return this;
        }

        public EvaluationRequest build() {
            return new EvaluationRequest(agentId, sessionId, action, resource, tool, metadata);
        }
    }
}
