package com.agentshield.exception;

/**
 * A valid decision token that the caller may not redeem (HTTP 403): it belongs to another agent, it was issued
 * for a different operation, or the agent is no longer ACTIVE.
 */
public class DecisionTokenForbiddenException extends RuntimeException {
    public DecisionTokenForbiddenException(String message) {
        super(message);
    }
}
