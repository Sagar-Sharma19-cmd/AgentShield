package com.agentshield.exception;

/**
 * Thrown when a review request state transition is not permitted by the review
 * workflow's state machine (see {@code com.agentshield.review.ReviewRequestService}).
 */
public class InvalidReviewStateException extends RuntimeException {

    public InvalidReviewStateException(String message) {
        super(message);
    }
}
