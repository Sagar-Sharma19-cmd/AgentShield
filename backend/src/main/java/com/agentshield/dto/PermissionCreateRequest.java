package com.agentshield.dto;

import com.agentshield.model.ActionType;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;

import java.util.Set;
import java.util.UUID;

/**
 * Payload for granting an agent an explicit set of actions on a tool.
 * {@code enabled} defaults to true when omitted.
 */
public record PermissionCreateRequest(
        @NotNull(message = "agentId is required")
        UUID agentId,

        @NotNull(message = "toolId is required")
        UUID toolId,

        @NotEmpty(message = "allowedActions must contain at least one action")
        Set<@NotNull(message = "allowedActions must not contain null") ActionType> allowedActions,

        Boolean enabled
) {
}
