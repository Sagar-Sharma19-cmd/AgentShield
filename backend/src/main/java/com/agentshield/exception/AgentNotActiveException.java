package com.agentshield.exception;

/** The authenticated agent is suspended or revoked, so the endpoint refuses to act for it. 403. */
public class AgentNotActiveException extends RuntimeException {
    public AgentNotActiveException(String message) {
        super(message);
    }
}
