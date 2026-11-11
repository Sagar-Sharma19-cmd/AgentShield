package com.agentshield.dto;

import java.time.Instant;
import java.util.UUID;

/** A successful redemption: the gateway request the decision belonged to, and when it was redeemed. */
public record DecisionRedeemResponse(UUID requestId, Instant redeemedAt) {
}
