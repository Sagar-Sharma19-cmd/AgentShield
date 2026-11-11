package com.agentshield.enforcement;

import com.agentshield.model.ActionType;

import java.time.Instant;
import java.util.UUID;

/**
 * The verified contents of a decision token. {@code resourceHash} is the SHA-256 hex of the resource the
 * decision was made for; the token never carries the raw resource.
 */
public record DecisionTokenClaims(
        UUID requestId,
        UUID agentId,
        String tool,
        ActionType action,
        String resourceHash,
        DecisionSource source,
        Instant issuedAt,
        Instant expiresAt
) {
}
