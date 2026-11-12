package com.agentshield.dto;

import com.agentshield.model.ActionType;
import com.fasterxml.jackson.databind.JsonNode;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.util.Map;

/**
 * Incoming request payload submitted by an AI agent for security evaluation.
 *
 * Size limits match the audit_logs / review_requests columns (V1, V5). Without them an oversized
 * value failed the audit insert after the decision was computed, so the request was answered with
 * a 409 and never audited. Now it is rejected up front with a 400.
 *
 * {@code arguments} (Phase V13) is optional: the JSON value (string, array or object) the agent is about to send
 * to the tool. The gateway inspects it for secrets, PII and prompt injection, and binds a SHA-256 of it to the
 * decision token. It is never persisted, logged or echoed; {@link #toString()} leaves it out. Absent (or null)
 * means nothing to inspect, exactly as before V13.
 */
public class EvaluationRequest {

    public static final int MAX_ID_LENGTH = 255;
    public static final int MAX_RESOURCE_LENGTH = 1024;

    @NotBlank(message = "agentId is required")
    @Size(max = MAX_ID_LENGTH, message = "agentId must be at most " + MAX_ID_LENGTH + " characters")
    private String agentId;

    @NotBlank(message = "sessionId is required")
    @Size(max = MAX_ID_LENGTH, message = "sessionId must be at most " + MAX_ID_LENGTH + " characters")
    private String sessionId;

    @NotNull(message = "action is required")
    private ActionType action;

    @NotBlank(message = "resource is required")
    @Size(max = MAX_RESOURCE_LENGTH, message = "resource must be at most " + MAX_RESOURCE_LENGTH + " characters")
    private String resource;

    @NotBlank(message = "tool is required")
    @Size(max = MAX_ID_LENGTH, message = "tool must be at most " + MAX_ID_LENGTH + " characters")
    private String tool;

    private Map<String, Object> metadata;

    private JsonNode arguments;

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

    public JsonNode getArguments() {
        return arguments;
    }

    public void setArguments(JsonNode arguments) {
        this.arguments = arguments;
    }

    /** Never prints arguments or metadata, which can hold the content being inspected. */
    @Override
    public String toString() {
        return "EvaluationRequest[agentId=" + agentId + ", sessionId=" + sessionId + ", tool=" + tool + ", action="
                + action + ", resource=" + resource + ", arguments=" + (arguments == null ? "none" : "<redacted>")
                + ", metadata=" + (metadata == null ? "none" : "<redacted>") + "]";
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
        private JsonNode arguments;

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

        public Builder arguments(JsonNode arguments) {
            this.arguments = arguments;
            return this;
        }

        public EvaluationRequest build() {
            EvaluationRequest request = new EvaluationRequest(agentId, sessionId, action, resource, tool, metadata);
            request.setArguments(arguments);
            return request;
        }
    }
}
