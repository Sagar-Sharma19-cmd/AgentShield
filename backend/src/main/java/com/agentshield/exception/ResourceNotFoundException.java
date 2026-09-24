package com.agentshield.exception;

/**
 * Thrown when a requested administrative resource (agent, tool, permission) does not exist.
 */
public class ResourceNotFoundException extends RuntimeException {

    public ResourceNotFoundException(String message) {
        super(message);
    }
}
