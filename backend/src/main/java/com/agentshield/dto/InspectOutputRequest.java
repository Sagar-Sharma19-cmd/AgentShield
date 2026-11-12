package com.agentshield.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/**
 * Body of POST /api/v1/gateway/inspect (Phase V13): tool output to scan before it is handed back to a model.
 * {@code content} is never persisted or logged; toString leaves it out.
 */
public record InspectOutputRequest(
        @NotBlank(message = "sessionId is required")
        @Size(max = EvaluationRequest.MAX_ID_LENGTH, message = "sessionId must be at most " + EvaluationRequest.MAX_ID_LENGTH + " characters")
        String sessionId,
        @NotBlank(message = "tool is required")
        @Size(max = MAX_TOOL_LENGTH, message = "tool must be at most " + MAX_TOOL_LENGTH + " characters")
        String tool,
        @NotNull(message = "content is required")
        @Size(max = MAX_CONTENT_LENGTH, message = "content must be at most " + MAX_CONTENT_LENGTH + " characters")
        String content
) {
    /** 256 KB of characters. */
    public static final int MAX_CONTENT_LENGTH = 256 * 1024;
    /** "output:" + tool must fit the 1024-character resource column; tool names are capped like everywhere else. */
    public static final int MAX_TOOL_LENGTH = EvaluationRequest.MAX_ID_LENGTH;

    @Override
    public String toString() {
        return "InspectOutputRequest[sessionId=" + sessionId + ", tool=" + tool + ", content=<redacted "
                + (content == null ? 0 : content.length()) + " chars>]";
    }
}
