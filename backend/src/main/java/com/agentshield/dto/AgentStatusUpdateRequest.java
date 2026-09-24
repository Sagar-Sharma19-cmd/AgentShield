package com.agentshield.dto;

import com.agentshield.model.AgentStatus;
import jakarta.validation.constraints.NotNull;

/**
 * Payload for PATCH /api/v1/agents/{id}/status.
 */
public record AgentStatusUpdateRequest(
        @NotNull(message = "status is required")
        AgentStatus status
) {
}
