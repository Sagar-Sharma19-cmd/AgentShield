package com.agentshield.exception;

/** The request's "arguments" (or output "content") are too large, too deeply nested or of the wrong JSON type. 400. */
public class InvalidArgumentsException extends RuntimeException {
    public InvalidArgumentsException(String message) {
        super(message);
    }
}
