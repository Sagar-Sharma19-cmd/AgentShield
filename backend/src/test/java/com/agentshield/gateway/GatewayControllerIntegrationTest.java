package com.agentshield.gateway;

import com.agentshield.agent.Agent;
import com.agentshield.agent.AgentRepository;
import com.agentshield.audit.AuditLog;
import com.agentshield.audit.AuditRepository;
import com.agentshield.model.ActionOutcome;
import com.agentshield.model.ActionType;
import com.agentshield.model.DecisionType;
import com.agentshield.model.ToolType;
import com.agentshield.permission.AgentToolPermission;
import com.agentshield.permission.AgentToolPermissionRepository;
import com.agentshield.tool.Tool;
import com.agentshield.tool.ToolRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class GatewayControllerIntegrationTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private AuditRepository auditRepository;

    @Autowired
    private AgentRepository agentRepository;

    @Autowired
    private ToolRepository toolRepository;

    @Autowired
    private AgentToolPermissionRepository permissionRepository;

    @BeforeEach
    void setUp() {
        auditRepository.deleteAll();
        permissionRepository.deleteAll();
        agentRepository.deleteAll();
        toolRepository.deleteAll();

        // The gateway now requires a registered, authorized agent before policy evaluation
        Agent agent = agentRepository.save(new Agent("test-agent-1", "Integration test agent"));
        Tool tool = toolRepository.save(new Tool("file-reader-tool", "Integration test tool", ToolType.FILESYSTEM));
        permissionRepository.save(new AgentToolPermission(agent, tool, Set.of(ActionType.READ, ActionType.DELETE), true));
    }

    @Test
    @DisplayName("15. Missing agentId -> validation failure (HTTP 400)")
    void testMissingAgentIdValidationFailure() throws Exception {
        Map<String, Object> payload = createValidPayload();
        payload.remove("agentId");

        mockMvc.perform(post("/api/v1/gateway/evaluate")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(payload)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.status").value(400))
                .andExpect(jsonPath("$.fieldErrors.agentId").exists());
    }

    @Test
    @DisplayName("16. Missing sessionId -> validation failure (HTTP 400)")
    void testMissingSessionIdValidationFailure() throws Exception {
        Map<String, Object> payload = createValidPayload();
        payload.remove("sessionId");

        mockMvc.perform(post("/api/v1/gateway/evaluate")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(payload)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.status").value(400))
                .andExpect(jsonPath("$.fieldErrors.sessionId").exists());
    }

    @Test
    @DisplayName("17. Missing action -> validation failure (HTTP 400)")
    void testMissingActionValidationFailure() throws Exception {
        Map<String, Object> payload = createValidPayload();
        payload.remove("action");

        mockMvc.perform(post("/api/v1/gateway/evaluate")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(payload)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.status").value(400))
                .andExpect(jsonPath("$.fieldErrors.action").exists());
    }

    @Test
    @DisplayName("18. Missing resource -> validation failure (HTTP 400)")
    void testMissingResourceValidationFailure() throws Exception {
        Map<String, Object> payload = createValidPayload();
        payload.remove("resource");

        mockMvc.perform(post("/api/v1/gateway/evaluate")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(payload)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.status").value(400))
                .andExpect(jsonPath("$.fieldErrors.resource").exists());
    }

    @Test
    @DisplayName("19. Missing tool -> validation failure (HTTP 400)")
    void testMissingToolValidationFailure() throws Exception {
        Map<String, Object> payload = createValidPayload();
        payload.remove("tool");

        mockMvc.perform(post("/api/v1/gateway/evaluate")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(payload)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.status").value(400))
                .andExpect(jsonPath("$.fieldErrors.tool").exists());
    }

    @Test
    @DisplayName("20. Audit record is persisted for ALLOW")
    void testAuditRecordPersistedForAllow() throws Exception {
        Map<String, Object> payload = createValidPayload();

        mockMvc.perform(post("/api/v1/gateway/evaluate")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(payload)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.decision").value("ALLOW"));

        List<AuditLog> logs = auditRepository.findByAgentId("test-agent-1");
        assertEquals(1, logs.size());
        AuditLog log = logs.get(0);
        assertEquals(DecisionType.ALLOW, log.getDecision());
        assertEquals(ActionOutcome.ALLOWED, log.getActionOutcome());
        assertEquals("src/main/App.java", log.getResource());
        assertNotNull(log.getRequestId());
    }

    @Test
    @DisplayName("21. Audit record is persisted for REVIEW")
    void testAuditRecordPersistedForReview() throws Exception {
        Map<String, Object> payload = createValidPayload();
        payload.put("action", "DELETE");
        payload.put("resource", "dev/temp-file.log");

        mockMvc.perform(post("/api/v1/gateway/evaluate")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(payload)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.decision").value("REVIEW"));

        List<AuditLog> logs = auditRepository.findByAgentId("test-agent-1");
        assertEquals(1, logs.size());
        AuditLog log = logs.get(0);
        assertEquals(DecisionType.REVIEW, log.getDecision());
        assertEquals(ActionOutcome.REVIEW_REQUIRED, log.getActionOutcome());
        assertEquals("dev/temp-file.log", log.getResource());
    }

    @Test
    @DisplayName("22. Audit record is persisted for DENY")
    void testAuditRecordPersistedForDeny() throws Exception {
        Map<String, Object> payload = createValidPayload();
        payload.put("action", "READ");
        payload.put("resource", ".env");

        mockMvc.perform(post("/api/v1/gateway/evaluate")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(payload)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.decision").value("DENY"));

        List<AuditLog> logs = auditRepository.findByAgentId("test-agent-1");
        assertEquals(1, logs.size());
        AuditLog log = logs.get(0);
        assertEquals(DecisionType.DENY, log.getDecision());
        assertEquals(ActionOutcome.BLOCKED, log.getActionOutcome());
        assertEquals(".env", log.getResource());
    }

    private Map<String, Object> createValidPayload() {
        Map<String, Object> map = new HashMap<>();
        map.put("agentId", "test-agent-1");
        map.put("sessionId", "session-xyz");
        map.put("action", ActionType.READ.name());
        map.put("resource", "src/main/App.java");
        map.put("tool", "file-reader-tool");
        map.put("metadata", Map.of("env", "test"));
        return map;
    }
}
