package com.agentshield.permission;

import com.agentshield.model.AuthorizationResult;

import java.util.UUID;

/**
 * Result produced by PermissionEngine.
 *
 * @param result  authorization outcome; anything other than AUTHORIZED must lead to DENY
 * @param reason  human-readable explanation (never contains secrets)
 * @param agentId resolved registered agent id, or null if the agent is unknown
 * @param toolId  resolved registered tool id, or null if the tool is unknown
 */
public record AuthorizationDecision(AuthorizationResult result, String reason, UUID agentId, UUID toolId) {

    public boolean isAuthorized() {
        return result == AuthorizationResult.AUTHORIZED;
    }
}
