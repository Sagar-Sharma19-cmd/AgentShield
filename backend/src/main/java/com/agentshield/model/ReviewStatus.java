package com.agentshield.model;

/**
 * Lifecycle status of a human {@code ReviewRequest}.
 *
 * Strict state machine: PENDING -> IN_REVIEW -> APPROVED | REJECTED. APPROVED and
 * REJECTED are terminal. See {@code com.agentshield.review.ReviewRequestService}.
 */
public enum ReviewStatus {
    PENDING,
    IN_REVIEW,
    APPROVED,
    REJECTED
}
