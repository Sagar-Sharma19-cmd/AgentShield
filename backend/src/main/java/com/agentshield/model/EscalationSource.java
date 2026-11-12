package com.agentshield.model;

/**
 * Which signal, if any, changed an audited decision from its pre-escalation value.
 *
 * NONE: no escalation occurred (the decision is the policy decision, or a DENY/REVIEW that was already present).
 * RISK_ENGINE: the Risk Engine escalated the decision.
 * TRAJECTORY: trajectory analysis changed an otherwise ALLOW decision to REVIEW.
 * INSPECTION: content inspection of the arguments denied the request (a secret), or raised an ALLOW to REVIEW
 *             (PII or prompt injection). Phase V13.
 *
 * A REVIEW or DENY that already existed before trajectory ran is never attributed to TRAJECTORY.
 */
public enum EscalationSource {
    NONE,
    RISK_ENGINE,
    TRAJECTORY,
    INSPECTION
}
