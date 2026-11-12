package com.agentshield.dto;

import com.agentshield.model.ActionType;
import com.fasterxml.jackson.databind.JsonNode;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/**
 * Body of POST /api/v1/gateway/decisions/redeem: the token, and the operation the agent is about to run. The
 * operation must be exactly the one the token was issued for. Limits match EvaluationRequest.
 *
 * {@code arguments} (Phase V13): when the decision was made with arguments, the token carries their hash and the
 * redeem must send the same arguments (any key order or whitespace). Never logged; toString leaves it out.
 */
public record DecisionRedeemRequest(
        @NotBlank @Size(max = 4096) String token,
        @NotBlank @Size(max = EvaluationRequest.MAX_ID_LENGTH) String tool,
        @NotNull ActionType action,
        @NotBlank @Size(max = EvaluationRequest.MAX_RESOURCE_LENGTH) String resource,
        JsonNode arguments
) {
    /** A redeem without arguments (as before V13). */
    public DecisionRedeemRequest(String token, String tool, ActionType action, String resource) {
        this(token, tool, action, resource, null);
    }

    /** Never prints the token. */
    @Override
    public String toString() {
        return "DecisionRedeemRequest[token=<redacted>, tool=" + tool + ", action=" + action + ", resource=" + resource
                + ", arguments=" + (arguments == null ? "none" : "<redacted>") + "]";
    }
}
