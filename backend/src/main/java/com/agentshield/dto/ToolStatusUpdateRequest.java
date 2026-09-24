package com.agentshield.dto;

import com.agentshield.model.ToolStatus;
import jakarta.validation.constraints.NotNull;

/**
 * Payload for PATCH /api/v1/tools/{id}/status.
 */
public record ToolStatusUpdateRequest(
        @NotNull(message = "status is required")
        ToolStatus status
) {
}
