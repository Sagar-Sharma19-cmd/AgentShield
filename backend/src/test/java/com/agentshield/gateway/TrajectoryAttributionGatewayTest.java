package com.agentshield.gateway;

import com.agentshield.audit.AuditLog;
import com.agentshield.model.EscalationSource;
import com.agentshield.model.RiskTier;
import com.agentshield.riskengine.RiskAssessment;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;

/**
 * escalated_by attribution and the trajectory audit fields, end to end through the gateway and the
 * real database. NULL trajectory fields mean "not evaluated"; a score of 0 means "evaluated, no signal".
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class TrajectoryAttributionGatewayTest extends AbstractTrajectoryGatewayTest {

    @Test
    @DisplayName("ALLOW escalated to REVIEW by trajectory: escalated_by TRAJECTORY, trajectory fields recorded")
    void trajectoryEscalationIsAttributedToTrajectory() throws Exception {
        String session = "attr-traj";
        seedEscalationHistory(session);

        var result = send(session, "filesystem", "READ", "src/Main.java")
                .andExpect(jsonPath("$.decision").value("REVIEW"));
        AuditLog row = auditFor(requestIdOf(result));

        assertEquals(EscalationSource.TRAJECTORY, row.getEscalatedBy());
        assertEquals(60, row.getTrajectoryScore());
        assertEquals(RiskTier.HIGH, row.getTrajectoryTier());
        assertNotNull(row.getTrajectoryReason());
        assertEquals(10, row.getRiskScore(), "policy score is unchanged by trajectory");
    }

    @Test
    @DisplayName("Risk Engine escalation: escalated_by RISK_ENGINE; trajectory evaluated with no history is 0 LOW, not NULL")
    void riskEngineEscalationIsAttributedToRiskEngine() throws Exception {
        when(riskEngineClient.assessRisk(any(), any(), any()))
                .thenReturn(new RiskAssessment(70, RiskTier.HIGH, List.of(), "HIGH risk", true));

        var result = send("attr-re", "filesystem", "READ", "src/Main.java")
                .andExpect(jsonPath("$.decision").value("REVIEW"));
        AuditLog row = auditFor(requestIdOf(result));

        assertEquals(EscalationSource.RISK_ENGINE, row.getEscalatedBy());
        assertEquals(0, row.getTrajectoryScore(), "evaluated with an empty history");
        assertEquals(RiskTier.LOW, row.getTrajectoryTier());
    }

    @Test
    @DisplayName("Policy REVIEW in a heavy session: escalated_by NONE, trajectory evaluated but not attributed")
    void existingReviewIsNotAttributedToTrajectory() throws Exception {
        String session = "attr-review";
        seedEscalationHistory(session);

        var result = send(session, "egress", "EXTERNAL_REQUEST", "https://api.example.test/export")
                .andExpect(jsonPath("$.decision").value("REVIEW"))
                .andExpect(jsonPath("$.reviewRequestId").isNotEmpty());
        AuditLog row = auditFor(requestIdOf(result));

        assertEquals(EscalationSource.NONE, row.getEscalatedBy());
        assertNotNull(row.getTrajectoryScore(), "trajectory was evaluated, so the score is recorded");
        assertNotNull(row.getTrajectoryTier());
    }

    @Test
    @DisplayName("Policy DENY: escalated_by NONE and trajectory fields NULL (not evaluated)")
    void denyHasNoTrajectoryAndNoEscalation() throws Exception {
        var result = send("attr-deny", "filesystem", "READ", ".env")
                .andExpect(jsonPath("$.decision").value("DENY"));
        AuditLog row = auditFor(requestIdOf(result));

        assertEquals(EscalationSource.NONE, row.getEscalatedBy());
        assertNull(row.getTrajectoryScore());
        assertNull(row.getTrajectoryTier());
        assertNull(row.getTrajectoryReason());
    }

    @Test
    @DisplayName("Authorization denial: escalated_by NONE and trajectory fields NULL")
    void authorizationDenialHasNoTrajectory() throws Exception {
        // docs is READ-only for this agent, so WRITE fails authorization before policy runs.
        var result = send("attr-authz", "docs", "WRITE", "docs/guide.md")
                .andExpect(jsonPath("$.decision").value("DENY"));
        AuditLog row = auditFor(requestIdOf(result));

        assertEquals(EscalationSource.NONE, row.getEscalatedBy());
        assertNull(row.getTrajectoryScore());
        assertNull(row.getTrajectoryTier());
    }
}
