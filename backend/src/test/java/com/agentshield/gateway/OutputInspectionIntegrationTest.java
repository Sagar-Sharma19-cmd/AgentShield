package com.agentshield.gateway;

import com.agentshield.audit.AuditLog;
import com.agentshield.config.MutableClock;
import com.agentshield.config.MutableClockConfig;
import com.agentshield.inspection.InspectionVerdict;
import com.agentshield.model.ActionType;
import com.agentshield.model.AgentStatus;
import com.agentshield.model.DecisionType;
import com.agentshield.model.EscalationSource;
import com.agentshield.security.AdminApiKeyAuthenticationFilter;
import com.agentshield.security.AgentApiKeyAuthenticationFilter;
import com.fasterxml.jackson.databind.JsonNode;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.ResultActions;

import java.time.Instant;
import java.util.Map;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** POST /api/v1/gateway/inspect: output scanning for the MCP proxy (Phase V13). */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Import(MutableClockConfig.class)
class OutputInspectionIntegrationTest extends AbstractTrajectoryGatewayTest {

    private static final String AWS_KEY = "AKIA" + "IOSFODNN7EXAMPLE";

    @Autowired
    private MutableClock clock;

    @Value("${agentshield.security.admin-api-key}")
    private String adminApiKey;

    @BeforeEach
    void setClock() {
        clock.set(Instant.now());
    }

    @Test
    @DisplayName("A secret in the output: DENY, redacted content, one audit row READ output:<tool>, no content stored")
    void secretOutput() throws Exception {
        JsonNode body = json(inspect("filesystem", "AWS_ACCESS_KEY_ID=" + AWS_KEY + "\nregion=eu-west-1")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.verdict").value("DENY"))
                .andExpect(jsonPath("$.findings[0].type").value("AWS_ACCESS_KEY"))
                .andExpect(jsonPath("$.findings[0].location").value("content"))
                .andExpect(jsonPath("$.redactedContent").value("AWS_ACCESS_KEY_ID=[REDACTED:AWS_ACCESS_KEY]\nregion=eu-west-1")));

        AuditLog audit = auditFor(UUID.fromString(body.get("requestId").asText()));
        assertEquals(ActionType.READ, audit.getAction());
        assertEquals("output:filesystem", audit.getResource());
        assertEquals(DecisionType.DENY, audit.getDecision());
        assertEquals(EscalationSource.INSPECTION, audit.getEscalatedBy());
        assertEquals(InspectionVerdict.DENY, audit.getInspectionVerdict());
        assertEquals(1, audit.getInspectionFindings().size());
    }

    @Test
    @DisplayName("PII in the output is REVIEW; clean output is ALLOW with the content unchanged")
    void piiAndClean() throws Exception {
        inspect("crm", "Customer: alice" + "@" + "example.com").andExpect(status().isOk())
                .andExpect(jsonPath("$.verdict").value("REVIEW"))
                .andExpect(jsonPath("$.redactedContent").value("Customer: [REDACTED:EMAIL]"));
        JsonNode clean = json(inspect("crm", "3 open tickets").andExpect(status().isOk())
                .andExpect(jsonPath("$.verdict").value("CLEAN"))
                .andExpect(jsonPath("$.findings").isEmpty())
                .andExpect(jsonPath("$.redactedContent").value("3 open tickets")));
        AuditLog audit = auditFor(UUID.fromString(clean.get("requestId").asText()));
        assertEquals(DecisionType.ALLOW, audit.getDecision());
        assertEquals(EscalationSource.NONE, audit.getEscalatedBy());
    }

    @Test
    @DisplayName("Content over 256 KB is a 400; missing content is a 400")
    void limits() throws Exception {
        inspect("crm", "x".repeat(256 * 1024 + 1)).andExpect(status().isBadRequest());
        mockMvc.perform(post("/api/v1/gateway/inspect").header(AgentApiKeyAuthenticationFilter.HEADER, agentApiKey)
                        .contentType(MediaType.APPLICATION_JSON).content("{\"sessionId\":\"s\",\"tool\":\"crm\"}"))
                .andExpect(status().isBadRequest());
        inspect("crm", "x".repeat(256 * 1024)).andExpect(status().isOk());
    }

    @Test
    @DisplayName("Agent key required (admin key is 401); a suspended agent gets 403")
    void authentication() throws Exception {
        mockMvc.perform(post("/api/v1/gateway/inspect").header(AdminApiKeyAuthenticationFilter.HEADER, adminApiKey)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"sessionId\":\"s\",\"tool\":\"crm\",\"content\":\"x\"}"))
                .andExpect(status().isUnauthorized());

        var agent = agentRepository.findByName(AGENT_ID).orElseThrow();
        agent.setStatus(AgentStatus.SUSPENDED);
        agentRepository.save(agent);
        inspect("crm", "x").andExpect(status().isForbidden());
    }

    private ResultActions inspect(String tool, String content) throws Exception {
        return mockMvc.perform(post("/api/v1/gateway/inspect")
                .header(AgentApiKeyAuthenticationFilter.HEADER, agentApiKey)
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(Map.of("sessionId", "out-" + UUID.randomUUID(), "tool", tool,
                        "content", content))));
    }

    private JsonNode json(ResultActions result) throws Exception {
        return objectMapper.readTree(result.andReturn().getResponse().getContentAsString());
    }
}
