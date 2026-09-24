package com.agentshield.model;

/**
 * Lifecycle status of a registered AI agent.
 * Only ACTIVE agents may have requests authorized. REVOKED is terminal.
 */
public enum AgentStatus {
    ACTIVE,
    SUSPENDED,
    REVOKED
}
