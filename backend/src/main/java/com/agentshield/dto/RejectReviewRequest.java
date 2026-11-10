package com.agentshield.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * Body of POST /api/v1/reviews/{id}/reject. Both the reviewer and a note explaining the rejection are
 * required, so the agent (and the audit trail) learns why.
 */
public record RejectReviewRequest(
        @NotBlank(message = "reviewer is required")
        @Size(max = 100, message = "reviewer must be at most 100 characters")
        String reviewer,

        @NotBlank(message = "note is required when rejecting")
        @Size(max = 1000, message = "note must be at most 1000 characters")
        String note
) {
}
