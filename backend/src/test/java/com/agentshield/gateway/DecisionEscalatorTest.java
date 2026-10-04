package com.agentshield.gateway;

import com.agentshield.model.DecisionType;
import com.agentshield.model.RiskTier;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;

/**
 * Exhaustive test of the escalate-only decision-combination rules (Phase 2, section 7/12 C-J).
 */
class DecisionEscalatorTest {

    private DecisionEscalator decisionEscalator;

    @BeforeEach
    void setUp() {
        decisionEscalator = new DecisionEscalator();
    }

    @Test
    @DisplayName("C. ALLOW + LOW -> ALLOW")
    void testAllowLow() {
        assertEquals(DecisionType.ALLOW, decisionEscalator.combine(DecisionType.ALLOW, RiskTier.LOW));
    }

    @Test
    @DisplayName("D. ALLOW + MEDIUM -> ALLOW")
    void testAllowMedium() {
        assertEquals(DecisionType.ALLOW, decisionEscalator.combine(DecisionType.ALLOW, RiskTier.MEDIUM));
    }

    @Test
    @DisplayName("E. ALLOW + HIGH -> REVIEW")
    void testAllowHigh() {
        assertEquals(DecisionType.REVIEW, decisionEscalator.combine(DecisionType.ALLOW, RiskTier.HIGH));
    }

    @Test
    @DisplayName("F. ALLOW + CRITICAL -> DENY")
    void testAllowCritical() {
        assertEquals(DecisionType.DENY, decisionEscalator.combine(DecisionType.ALLOW, RiskTier.CRITICAL));
    }

    @Test
    @DisplayName("G. REVIEW + LOW -> REVIEW")
    void testReviewLow() {
        assertEquals(DecisionType.REVIEW, decisionEscalator.combine(DecisionType.REVIEW, RiskTier.LOW));
    }

    @Test
    @DisplayName("G. REVIEW + MEDIUM -> REVIEW")
    void testReviewMedium() {
        assertEquals(DecisionType.REVIEW, decisionEscalator.combine(DecisionType.REVIEW, RiskTier.MEDIUM));
    }

    @Test
    @DisplayName("H. REVIEW + HIGH -> REVIEW")
    void testReviewHigh() {
        assertEquals(DecisionType.REVIEW, decisionEscalator.combine(DecisionType.REVIEW, RiskTier.HIGH));
    }

    @Test
    @DisplayName("I. REVIEW + CRITICAL -> DENY")
    void testReviewCritical() {
        assertEquals(DecisionType.DENY, decisionEscalator.combine(DecisionType.REVIEW, RiskTier.CRITICAL));
    }

    @Test
    @DisplayName("J. DENY + LOW -> DENY (risk never downgrades)")
    void testDenyLow() {
        assertEquals(DecisionType.DENY, decisionEscalator.combine(DecisionType.DENY, RiskTier.LOW));
    }

    @Test
    @DisplayName("J. DENY + MEDIUM -> DENY (risk never downgrades)")
    void testDenyMedium() {
        assertEquals(DecisionType.DENY, decisionEscalator.combine(DecisionType.DENY, RiskTier.MEDIUM));
    }

    @Test
    @DisplayName("J. DENY + HIGH -> DENY (risk never downgrades)")
    void testDenyHigh() {
        assertEquals(DecisionType.DENY, decisionEscalator.combine(DecisionType.DENY, RiskTier.HIGH));
    }

    @Test
    @DisplayName("J. DENY + CRITICAL -> DENY (risk never downgrades)")
    void testDenyCritical() {
        assertEquals(DecisionType.DENY, decisionEscalator.combine(DecisionType.DENY, RiskTier.CRITICAL));
    }

    @Test
    @DisplayName("J. DENY + risk engine not consulted (null tier) -> DENY")
    void testDenyWithNullTier() {
        assertEquals(DecisionType.DENY, decisionEscalator.combine(DecisionType.DENY, null));
    }

    @Test
    @DisplayName("Forbidden transitions: DENY never escapes DENY, REVIEW never becomes ALLOW")
    void testForbiddenTransitionsNeverOccur() {
        for (RiskTier tier : RiskTier.values()) {
            assertEquals(DecisionType.DENY, decisionEscalator.combine(DecisionType.DENY, tier),
                    "DENY must remain DENY for risk tier " + tier);
            assertEquals(false, decisionEscalator.combine(DecisionType.REVIEW, tier) == DecisionType.ALLOW,
                    "REVIEW must never be downgraded to ALLOW for risk tier " + tier);
        }
    }
}
