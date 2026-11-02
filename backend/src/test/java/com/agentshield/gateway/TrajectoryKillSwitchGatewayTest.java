package com.agentshield.gateway;

import com.agentshield.audit.AuditLog;
import com.agentshield.model.EscalationSource;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;

/**
 * With agentshield.trajectory.enabled=false the same heavy history that escalates to REVIEW in
 * TrajectoryAttributionGatewayTest must leave the decision exactly as policy and the Risk Engine set it.
 */
@SpringBootTest(properties = "agentshield.trajectory.enabled=false")
@AutoConfigureMockMvc
@ActiveProfiles("test")
class TrajectoryKillSwitchGatewayTest extends AbstractTrajectoryGatewayTest {

    @Test
    @DisplayName("Kill switch off: a heavy-history ALLOW stays ALLOW, no review, and trajectory is recorded as not evaluated")
    void disabledTrajectoryDoesNotEscalate() throws Exception {
        String session = "kill-heavy";
        seedEscalationHistory(session);

        var result = send(session, "filesystem", "READ", "src/Main.java")
                .andExpect(jsonPath("$.decision").value("ALLOW"))
                .andExpect(jsonPath("$.riskScore").value(10))
                .andExpect(jsonPath("$.reviewRequestId").doesNotExist());
        AuditLog row = auditFor(requestIdOf(result));

        assertEquals("ALLOW", row.getDecision().name());
        assertEquals(EscalationSource.NONE, row.getEscalatedBy());
        assertNull(row.getTrajectoryScore());
        assertNull(row.getTrajectoryTier());
        assertNull(row.getTrajectoryReason());
    }

    @Test
    @DisplayName("Kill switch off: policy DENY is unchanged")
    void disabledTrajectoryKeepsDeny() throws Exception {
        send("kill-deny", "filesystem", "READ", ".env")
                .andExpect(jsonPath("$.decision").value("DENY"))
                .andExpect(jsonPath("$.riskScore").value(90));
    }
}
