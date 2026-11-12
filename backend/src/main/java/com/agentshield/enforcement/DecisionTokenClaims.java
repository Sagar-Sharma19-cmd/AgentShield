package com.agentshield.enforcement;

import com.agentshield.model.ActionType;

import java.time.Instant;
import java.util.UUID;

/**
 * The verified contents of a decision token. {@code resourceHash} is the SHA-256 hex of the resource the
 * decision was made for; the token never carries the raw resource. {@code argsHash} (Phase V13) is the SHA-256 hex
 * of the canonical JSON of the arguments the decision was made with, or null when there were none.
 */
public record DecisionTokenClaims(
        UUID requestId,
        UUID agentId,
        String tool,
        ActionType action,
        String resourceHash,
        DecisionSource source,
        Instant issuedAt,
        Instant expiresAt,
        String argsHash
) {
    /** Claims of a token without arguments (as before V13). */
    public DecisionTokenClaims(UUID requestId, UUID agentId, String tool, ActionType action, String resourceHash,
                               DecisionSource source, Instant issuedAt, Instant expiresAt) {
        this(requestId, agentId, tool, action, resourceHash, source, issuedAt, expiresAt, null);
    }
}
