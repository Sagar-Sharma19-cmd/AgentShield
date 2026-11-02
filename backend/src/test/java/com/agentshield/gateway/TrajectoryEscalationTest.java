package com.agentshield.gateway;

import com.agentshield.model.DecisionType;
import com.agentshield.model.RiskTier;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;

/**
 * Escalate-only rules for trajectory tiers (DecisionEscalator#combineTrajectory).
 * The existing combine(DecisionType, RiskTier) rules are covered by DecisionEscalatorTest.
 */
class TrajectoryEscalationTest {

    private DecisionEscalator decisionEscalator;

    @BeforeEach
    void setUp() {
        decisionEscalator = new DecisionEscalator();
    }

    @Test
    @DisplayName("ALLOW + trajectory HIGH -> REVIEW")
    void allowHighEscalatesToReview() {
        assertEquals(DecisionType.REVIEW, decisionEscalator.combineTrajectory(DecisionType.ALLOW, RiskTier.HIGH));
    }

    @Test
    @DisplayName("ALLOW + trajectory CRITICAL -> REVIEW (trajectory is capped at REVIEW, never DENY)")
    void allowCriticalCapsAtReview() {
        assertEquals(DecisionType.REVIEW, decisionEscalator.combineTrajectory(DecisionType.ALLOW, RiskTier.CRITICAL));
    }

    @Test
    @DisplayName("ALLOW + trajectory LOW or MEDIUM -> ALLOW")
    void allowLowOrMediumStaysAllow() {
        assertEquals(DecisionType.ALLOW, decisionEscalator.combineTrajectory(DecisionType.ALLOW, RiskTier.LOW));
        assertEquals(DecisionType.ALLOW, decisionEscalator.combineTrajectory(DecisionType.ALLOW, RiskTier.MEDIUM));
    }

    @Test
    @DisplayName("REVIEW is never downgraded to ALLOW, for any trajectory tier")
    void reviewNeverDowngraded() {
        for (RiskTier tier : RiskTier.values()) {
            assertEquals(DecisionType.REVIEW, decisionEscalator.combineTrajectory(DecisionType.REVIEW, tier),
                    "REVIEW must stay REVIEW for trajectory tier " + tier);
        }
    }

    @Test
    @DisplayName("DENY is never changed by trajectory, for any tier")
    void denyNeverChanged() {
        for (RiskTier tier : RiskTier.values()) {
            assertEquals(DecisionType.DENY, decisionEscalator.combineTrajectory(DecisionType.DENY, tier),
                    "DENY must stay DENY for trajectory tier " + tier);
        }
        assertEquals(DecisionType.DENY, decisionEscalator.combineTrajectory(DecisionType.DENY, null));
    }

    @Test
    @DisplayName("Trajectory alone never produces DENY from an ALLOW or REVIEW, for any tier")
    void trajectoryNeverProducesDeny() {
        for (RiskTier tier : RiskTier.values()) {
            assertEquals(false, decisionEscalator.combineTrajectory(DecisionType.ALLOW, tier) == DecisionType.DENY,
                    "ALLOW + trajectory " + tier + " must not become DENY");
            assertEquals(false, decisionEscalator.combineTrajectory(DecisionType.REVIEW, tier) == DecisionType.DENY,
                    "REVIEW + trajectory " + tier + " must not become DENY");
        }
    }

    @Test
    @DisplayName("Trajectory not evaluated (null tier) leaves the decision unchanged")
    void nullTrajectoryLeavesDecisionUnchanged() {
        assertEquals(DecisionType.ALLOW, decisionEscalator.combineTrajectory(DecisionType.ALLOW, null));
        assertEquals(DecisionType.REVIEW, decisionEscalator.combineTrajectory(DecisionType.REVIEW, null));
    }
}
