package com.agentshield.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * Body of POST /api/v1/reviews/{id}/approve. The reviewer is required; the note is optional.
 * The reviewer is a name the operator types, not an authenticated identity (the admin key is shared).
 */
public record ApproveReviewRequest(
        @NotBlank(message = "reviewer is required")
        @Size(max = 100, message = "reviewer must be at most 100 characters")
        String reviewer,

        @Size(max = 1000, message = "note must be at most 1000 characters")
        String note
) {
}
