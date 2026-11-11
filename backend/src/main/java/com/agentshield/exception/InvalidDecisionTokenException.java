package com.agentshield.exception;

/**
 * A decision token that is malformed, has a bad signature or has expired (HTTP 401). The message is generic
 * on purpose and never contains the token.
 */
public class InvalidDecisionTokenException extends RuntimeException {
    public InvalidDecisionTokenException(String message) {
        super(message);
    }
}
