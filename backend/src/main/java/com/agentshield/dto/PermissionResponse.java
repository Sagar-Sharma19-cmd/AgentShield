package com.agentshield.dto;

import com.agentshield.model.ActionType;
import com.agentshield.permission.AgentToolPermission;

import java.time.Instant;
import java.util.EnumSet;
import java.util.Set;
import java.util.UUID;

/**
 * Agent-tool permission grant returned by the permission API.
 */
public record PermissionResponse(
        UUID id,
        UUID agentId,
        String agentName,
        UUID toolId,
        String toolName,
        Set<ActionType> allowedActions,
        boolean enabled,
        Instant createdAt,
        Instant updatedAt
) {
    public static PermissionResponse from(AgentToolPermission permission) {
        Set<ActionType> actions = EnumSet.noneOf(ActionType.class);
        actions.addAll(permission.getAllowedActions());
        return new PermissionResponse(
                permission.getId(),
                permission.getAgent().getId(),
                permission.getAgent().getName(),
                permission.getTool().getId(),
                permission.getTool().getName(),
                actions,
                permission.isEnabled(),
                permission.getCreatedAt(),
                permission.getUpdatedAt());
    }
}
