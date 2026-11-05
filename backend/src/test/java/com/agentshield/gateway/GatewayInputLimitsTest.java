package com.agentshield.gateway;

import com.agentshield.dto.EvaluationRequest;
import com.agentshield.security.AgentApiKeyAuthenticationFilter;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.ResultActions;

import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Oversized gateway input is rejected with 400 before any decision is made, so nothing is half-written.
 * Before the size limits, a resource longer than the 1024-character column failed the audit insert and the
 * request was answered with 409 without an audit row.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class GatewayInputLimitsTest extends AbstractTrajectoryGatewayTest {

    @Test
    @DisplayName("A resource at the 1024-character limit is evaluated and audited")
    void resourceAtLimitIsAccepted() throws Exception {
        String resource = "src/" + "a".repeat(EvaluationRequest.MAX_RESOURCE_LENGTH - 4);

        evaluate("limits-ok", resource)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.decision").value("ALLOW"));

        assertEquals(1, auditRepository.count());
    }

    @Test
    @DisplayName("A resource over 1024 characters is a 400 and writes no audit row or risk assessment")
    void oversizedResourceIsRejectedBeforeEvaluation() throws Exception {
        String resource = "src/" + "a".repeat(EvaluationRequest.MAX_RESOURCE_LENGTH - 3);

        evaluate("limits-long", resource)
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.fieldErrors.resource").exists());

        assertEquals(0, auditRepository.count(), "no decision was made, so nothing is audited");
        assertEquals(0, riskAssessmentRepository.count());
    }

    @Test
    @DisplayName("A sessionId over 255 characters is a 400")
    void oversizedSessionIdIsRejected() throws Exception {
        evaluate("s".repeat(EvaluationRequest.MAX_ID_LENGTH + 1), "src/Main.java")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.fieldErrors.sessionId").exists());

        assertEquals(0, auditRepository.count());
    }

    private ResultActions evaluate(String session, String resource) throws Exception {
        return mockMvc.perform(post("/api/v1/gateway/evaluate")
                .header(AgentApiKeyAuthenticationFilter.HEADER, agentApiKey)
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(Map.of("agentId", AGENT_ID, "sessionId", session,
                        "tool", "filesystem", "action", "READ", "resource", resource))));
    }
}
