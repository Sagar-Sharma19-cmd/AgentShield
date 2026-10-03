package com.agentshield.dto;

import com.agentshield.agent.Agent;
import com.agentshield.model.AgentStatus;

import java.time.Instant;
import java.util.UUID;

/**
 * Registered agent returned by the agent administration API. Never contains the API key itself.
 */
public record AgentResponse(
        UUID id,
        String name,
        String description,
        AgentStatus status,
        String apiKeyPrefix,
        Instant createdAt,
        Instant updatedAt
) {
    public static AgentResponse from(Agent agent) {
        return new AgentResponse(agent.getId(), agent.getName(), agent.getDescription(),
                agent.getStatus(), agent.getApiKeyPrefix(), agent.getCreatedAt(), agent.getUpdatedAt());
    }
}
