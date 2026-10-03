package com.agentshield.dto;

import com.agentshield.agent.Agent;
import com.agentshield.model.AgentStatus;

import java.time.Instant;
import java.util.UUID;

/**
 * Returned by agent registration and key rotation. {@code apiKey} is the plaintext key and is
 * shown only in this response — AgentShield stores only its hash and cannot show it again.
 */
public record AgentCreateResponse(
        UUID id,
        String name,
        String description,
        AgentStatus status,
        String apiKeyPrefix,
        String apiKey,
        Instant createdAt,
        Instant updatedAt
) {
    public static AgentCreateResponse from(Agent agent, String apiKey) {
        return new AgentCreateResponse(agent.getId(), agent.getName(), agent.getDescription(), agent.getStatus(),
                agent.getApiKeyPrefix(), apiKey, agent.getCreatedAt(), agent.getUpdatedAt());
    }
}
