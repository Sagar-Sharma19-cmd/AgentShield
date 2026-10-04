package com.agentshield.gateway;

import com.agentshield.model.DecisionType;
import com.agentshield.model.RiskTier;
import org.springframework.stereotype.Component;

/**
 * Combines an existing authorization/policy decision with a Risk Engine risk tier.
 *
 * The Risk Engine is a risk SIGNAL, not an authorization authority: this combination is
 * escalate-only. An existing DENY is always final. Otherwise:
 *
 * <pre>
 * existing ALLOW:  LOW/MEDIUM -> ALLOW,  HIGH -> REVIEW,  CRITICAL -> DENY
 * existing REVIEW: LOW/MEDIUM -> REVIEW, HIGH -> REVIEW,  CRITICAL -> DENY
 * existing DENY:   always -> DENY
 * </pre>
 *
 * Forbidden transitions (DENY to REVIEW/ALLOW, REVIEW to ALLOW) are structurally impossible
 * here: this method never returns a decision less restrictive than {@code existingDecision}.
 */
@Component
public class DecisionEscalator {

    /**
     * @param riskTier may be {@code null} when the Risk Engine was not consulted (e.g. the
     *                 existing decision was already DENY); the existing decision is returned
     *                 unchanged in that case.
     */
    public DecisionType combine(DecisionType existingDecision, RiskTier riskTier) {
        if (existingDecision == DecisionType.DENY) {
            return DecisionType.DENY;
        }
        if (riskTier == null) {
            return existingDecision;
        }
        if (riskTier == RiskTier.CRITICAL) {
            return DecisionType.DENY;
        }
        if (riskTier == RiskTier.HIGH) {
            return DecisionType.REVIEW;
        }
        // LOW or MEDIUM: risk does not change an existing ALLOW or REVIEW.
        return existingDecision;
    }
}
