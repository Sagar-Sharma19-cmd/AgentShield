package com.agentshield.enforcement;

/** Why a decision token was issued: a final gateway ALLOW, or the claim of an operator-approved review. */
public enum DecisionSource {
    ALLOW,
    REVIEW_APPROVED
}
