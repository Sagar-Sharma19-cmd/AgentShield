package com.agentshield.dto;

import com.agentshield.model.ActionType;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/**
 * Body of POST /api/v1/gateway/decisions/redeem: the token, and the operation the agent is about to run. The
 * operation must be exactly the one the token was issued for. Limits match EvaluationRequest.
 */
public record DecisionRedeemRequest(
        @NotBlank @Size(max = 4096) String token,
        @NotBlank @Size(max = EvaluationRequest.MAX_ID_LENGTH) String tool,
        @NotNull ActionType action,
        @NotBlank @Size(max = EvaluationRequest.MAX_RESOURCE_LENGTH) String resource
) {
    /** Never prints the token. */
    @Override
    public String toString() {
        return "DecisionRedeemRequest[token=<redacted>, tool=" + tool + ", action=" + action + ", resource=" + resource + "]";
    }
}
