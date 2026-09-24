package com.agentshield.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/**
 * Payload for registering a new AI agent. Newly registered agents are ACTIVE.
 */
public record AgentCreateRequest(
        @NotBlank(message = "name is required")
        @Pattern(regexp = "^[a-z0-9][a-z0-9._-]{1,99}$",
                message = "name must be 2-100 chars: lowercase letters, digits, '.', '_' or '-'")
        String name,

        @Size(max = 1000, message = "description must be at most 1000 characters")
        String description
) {
}
