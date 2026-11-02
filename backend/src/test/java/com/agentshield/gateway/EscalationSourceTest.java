package com.agentshield.gateway;

import com.agentshield.model.DecisionType;
import com.agentshield.model.EscalationSource;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;

/**
 * Escalation attribution rules for audit.escalated_by. Only the stage that actually changed the decision
 * is credited, and a REVIEW or DENY that already existed is never credited to trajectory.
 */
class EscalationSourceTest {

    @Test
    @DisplayName("No change from policy: NONE")
    void noChangeIsNone() {
        assertEquals(EscalationSource.NONE,
                GatewayService.escalationSource(DecisionType.ALLOW, DecisionType.ALLOW, DecisionType.ALLOW));
    }

    @Test
    @DisplayName("Risk Engine changed the decision: RISK_ENGINE")
    void riskEngineChangeIsRiskEngine() {
        assertEquals(EscalationSource.RISK_ENGINE,
                GatewayService.escalationSource(DecisionType.ALLOW, DecisionType.REVIEW, DecisionType.REVIEW));
        assertEquals(EscalationSource.RISK_ENGINE,
                GatewayService.escalationSource(DecisionType.REVIEW, DecisionType.DENY, DecisionType.DENY));
    }

    @Test
    @DisplayName("Trajectory changed an ALLOW to REVIEW: TRAJECTORY")
    void trajectoryChangeIsTrajectory() {
        assertEquals(EscalationSource.TRAJECTORY,
                GatewayService.escalationSource(DecisionType.ALLOW, DecisionType.ALLOW, DecisionType.REVIEW));
    }

    @Test
    @DisplayName("An existing REVIEW is never attributed to trajectory")
    void existingReviewIsNotTrajectory() {
        assertEquals(EscalationSource.NONE,
                GatewayService.escalationSource(DecisionType.REVIEW, DecisionType.REVIEW, DecisionType.REVIEW));
    }

    @Test
    @DisplayName("An existing DENY is never attributed to trajectory")
    void existingDenyIsNotTrajectory() {
        assertEquals(EscalationSource.NONE,
                GatewayService.escalationSource(DecisionType.DENY, DecisionType.DENY, DecisionType.DENY));
    }
}
