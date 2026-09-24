package com.agentshield.dto;

import com.agentshield.model.ToolStatus;
import com.agentshield.model.ToolType;
import com.agentshield.tool.Tool;

import java.time.Instant;
import java.util.UUID;

/**
 * Registered tool returned by the tool registry API.
 */
public record ToolResponse(
        UUID id,
        String name,
        String description,
        ToolType toolType,
        ToolStatus status,
        Instant createdAt,
        Instant updatedAt
) {
    public static ToolResponse from(Tool tool) {
        return new ToolResponse(tool.getId(), tool.getName(), tool.getDescription(), tool.getToolType(),
                tool.getStatus(), tool.getCreatedAt(), tool.getUpdatedAt());
    }
}
