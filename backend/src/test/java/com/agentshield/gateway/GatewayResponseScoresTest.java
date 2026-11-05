package com.agentshield.gateway;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;

/**
 * The gateway response reports each score separately and the effective score (the highest of them), so an
 * escalated decision is not shown next to the low policy score alone. riskScore keeps its meaning.
 * The Risk Engine mock in AbstractTrajectoryGatewayTest returns score 50, tier LOW.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class GatewayResponseScoresTest extends AbstractTrajectoryGatewayTest {

    @Test
    @DisplayName("ALLOW: effective score is the highest of policy (10), Risk Engine (50) and trajectory (0)")
    void allowReportsAllScores() throws Exception {
        send("scores-allow", "filesystem", "READ", "src/Main.java")
                .andExpect(jsonPath("$.decision").value("ALLOW"))
                .andExpect(jsonPath("$.riskScore").value(10))
                .andExpect(jsonPath("$.riskEngineScore").value(50))
                .andExpect(jsonPath("$.trajectoryScore").value(0))
                .andExpect(jsonPath("$.effectiveRiskScore").value(50));
    }

    @Test
    @DisplayName("Trajectory escalation: REVIEW is reported with the trajectory score (60) as effective score")
    void trajectoryEscalationReportsTrajectoryScore() throws Exception {
        seedEscalationHistory("scores-traj");

        send("scores-traj", "filesystem", "READ", "src/Main.java")
                .andExpect(jsonPath("$.decision").value("REVIEW"))
                .andExpect(jsonPath("$.riskScore").value(10))
                .andExpect(jsonPath("$.trajectoryScore").value(60))
                .andExpect(jsonPath("$.effectiveRiskScore").value(60));
    }

    @Test
    @DisplayName("Policy DENY: Risk Engine and trajectory are not consulted, effective score is the policy score")
    void policyDenyHasOnlyThePolicyScore() throws Exception {
        send("scores-deny", "filesystem", "READ", ".env")
                .andExpect(jsonPath("$.decision").value("DENY"))
                .andExpect(jsonPath("$.riskEngineScore").doesNotExist())
                .andExpect(jsonPath("$.trajectoryScore").doesNotExist())
                .andExpect(jsonPath("$.effectiveRiskScore").value(90));
    }
}
