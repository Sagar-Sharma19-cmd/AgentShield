package com.agentshield.gateway;

import com.agentshield.review.ReviewRequestService;
import com.agentshield.security.AgentApiKeyAuthenticationFilter;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * The gateway write path is one transaction. If the last write (the review request) fails, the risk
 * assessment and audit row written earlier in the same request are rolled back too, and the agent gets an
 * error, not a decision.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class GatewayAtomicityTest extends AbstractTrajectoryGatewayTest {

    @MockitoBean
    private ReviewRequestService reviewRequestService;

    @Test
    @DisplayName("A failure creating the review request rolls back the audit row and risk assessment")
    void reviewCreationFailureRollsBackEarlierWrites() throws Exception {
        when(reviewRequestService.createReviewRequest(any(), any(), any(), anyInt(), any(), any(), any(), any(), any()))
                .thenThrow(new IllegalStateException("simulated review store failure"));

        // Non-production DELETE on a granted tool: PolicyEngine -> REVIEW, so a review request is created.
        mockMvc.perform(post("/api/v1/gateway/evaluate")
                        .header(AgentApiKeyAuthenticationFilter.HEADER, agentApiKey)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("agentId", AGENT_ID, "sessionId", "atomic-1",
                                "tool", "filesystem", "action", "DELETE", "resource", "tmp/build-cache"))))
                .andExpect(status().isInternalServerError());

        assertEquals(0, auditRepository.count(), "audit row rolled back with the failed request");
        assertEquals(0, riskAssessmentRepository.count(), "risk assessment rolled back with the failed request");
    }
}
