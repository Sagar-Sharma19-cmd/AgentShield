package com.agentshield.model;

/**
 * Outcome of the PermissionEngine authorization check.
 * Every value other than AUTHORIZED results in a DENY decision.
 */
public enum AuthorizationResult {
    AUTHORIZED,
    UNAUTHORIZED,
    AGENT_NOT_FOUND,
    AGENT_SUSPENDED,
    AGENT_REVOKED,
    TOOL_NOT_FOUND,
    TOOL_DISABLED,
    PERMISSION_DISABLED
}
