package com.agentshield.exception;

/**
 * Thrown when a request conflicts with existing state (duplicate name, invalid status transition).
 */
public class ConflictException extends RuntimeException {

    public ConflictException(String message) {
        super(message);
    }
}
