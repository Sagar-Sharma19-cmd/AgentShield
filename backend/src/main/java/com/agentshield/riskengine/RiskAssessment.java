package com.agentshield.riskengine;

import com.agentshield.model.RiskTier;

import java.util.List;

/**
 * Typed result of a Risk Engine assessment (successful or fallback).
 *
 * This is a risk SIGNAL only: it is never an authorization decision and must only ever be
 * used to escalate an existing ALLOW/REVIEW/DENY decision, never to grant or downgrade one.
 * See {@link com.agentshield.gateway.DecisionEscalator}.
 */
public record RiskAssessment(int riskScore, RiskTier riskTier, List<RiskFactor> factors, String reason,
                              boolean engineAvailable) {

    /** Approved fail-safe fallback (Risk Engine timeout, outage, or invalid response). */
    public static final int UNAVAILABLE_FALLBACK_SCORE = 65;
    public static final RiskTier UNAVAILABLE_FALLBACK_TIER = RiskTier.HIGH;
    public static final String UNAVAILABLE_REASON = "risk_engine_unavailable";

    public static RiskAssessment unavailable() {
        return new RiskAssessment(UNAVAILABLE_FALLBACK_SCORE, UNAVAILABLE_FALLBACK_TIER,
                List.of(), UNAVAILABLE_REASON, false);
    }
}
