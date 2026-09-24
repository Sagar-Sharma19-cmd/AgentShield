package com.agentshield.gateway;

import com.agentshield.agent.Agent;
import com.agentshield.agent.AgentRepository;
import com.agentshield.audit.AuditLog;
import com.agentshield.audit.AuditRepository;
import com.agentshield.model.ActionOutcome;
import com.agentshield.model.ActionType;
import com.agentshield.model.AgentStatus;
import com.agentshield.model.AuthorizationResult;
import com.agentshield.model.DecisionType;
import com.agentshield.model.ToolStatus;
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
import org.springframework.test.web.servlet.ResultActions;

import java.util.List;
import java.util.Map;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * End-to-end tests of the gateway decision hierarchy:
 * identity -> tool registry -> permission -> policy -> audit.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class GatewayAuthorizationIntegrationTest {

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

    private Agent agent;
    private Tool filesystem;

    @BeforeEach
    void setUp() {
        auditRepository.deleteAll();
        permissionRepository.deleteAll();
        agentRepository.deleteAll();
        toolRepository.deleteAll();

        agent = agentRepository.save(new Agent("deployment-agent", null));
        filesystem = toolRepository.save(new Tool("filesystem", null, ToolType.FILESYSTEM));
    }

    @Test
    @DisplayName("Gateway 15. Valid agent + tool + READ grant + safe READ -> ALLOW")
    void testAuthorizedSafeReadAllowed() throws Exception {
        grant(ActionType.READ);

        evaluate("READ", "src/Main.java")
                .andExpect(jsonPath("$.decision").value("ALLOW"))
                .andExpect(jsonPath("$.authorizationResult").value("AUTHORIZED"))
                .andExpect(jsonPath("$.riskScore").value(10));
    }

    @Test
    @DisplayName("Gateway 16. Valid agent without any grant -> DENY / UNAUTHORIZED")
    void testMissingPermissionDenied() throws Exception {
        evaluate("READ", "src/Main.java")
                .andExpect(jsonPath("$.decision").value("DENY"))
                .andExpect(jsonPath("$.authorizationResult").value("UNAUTHORIZED"))
                .andExpect(jsonPath("$.riskScore").value(100));
    }

    @Test
    @DisplayName("Policy cannot override missing permission: WRITE allowed by policy but not granted -> DENY")
    void testPolicyCannotOverrideMissingPermission() throws Exception {
        grant(ActionType.READ);

        evaluate("WRITE", "src/Main.java")
                .andExpect(jsonPath("$.decision").value("DENY"))
                .andExpect(jsonPath("$.authorizationResult").value("UNAUTHORIZED"));
    }

    @Test
    @DisplayName("Gateway 17. Suspended agent -> DENY / AGENT_SUSPENDED")
    void testSuspendedAgentDenied() throws Exception {
        grant(ActionType.READ);
        agent.setStatus(AgentStatus.SUSPENDED);
        agentRepository.save(agent);

        evaluate("READ", "src/Main.java")
                .andExpect(jsonPath("$.decision").value("DENY"))
                .andExpect(jsonPath("$.authorizationResult").value("AGENT_SUSPENDED"));
    }

    @Test
    @DisplayName("Gateway 18. Disabled tool -> DENY / TOOL_DISABLED")
    void testDisabledToolDenied() throws Exception {
        grant(ActionType.READ);
        filesystem.setStatus(ToolStatus.DISABLED);
        toolRepository.save(filesystem);

        evaluate("READ", "src/Main.java")
                .andExpect(jsonPath("$.decision").value("DENY"))
                .andExpect(jsonPath("$.authorizationResult").value("TOOL_DISABLED"));
    }

    @Test
    @DisplayName("Gateway 19. Authorized agent accessing .env -> DENY by policy")
    void testAuthorizedDotEnvDeniedByPolicy() throws Exception {
        grant(ActionType.READ);

        evaluate("READ", ".env")
                .andExpect(jsonPath("$.decision").value("DENY"))
                .andExpect(jsonPath("$.authorizationResult").value("AUTHORIZED"))
                .andExpect(jsonPath("$.riskScore").value(90));
    }

    @Test
    @DisplayName("Gateway 20. Authorized DELETE on dev resource -> REVIEW")
    void testAuthorizedDeleteDevReview() throws Exception {
        grant(ActionType.DELETE);

        evaluate("DELETE", "dev/temp-file.log")
                .andExpect(jsonPath("$.decision").value("REVIEW"))
                .andExpect(jsonPath("$.authorizationResult").value("AUTHORIZED"))
                .andExpect(jsonPath("$.riskScore").value(60));
    }

    @Test
    @DisplayName("Gateway 21. Authorized DELETE on production -> DENY by policy")
    void testAuthorizedDeleteProductionDenied() throws Exception {
        grant(ActionType.DELETE);

        evaluate("DELETE", "production/users-table")
                .andExpect(jsonPath("$.decision").value("DENY"))
                .andExpect(jsonPath("$.authorizationResult").value("AUTHORIZED"))
                .andExpect(jsonPath("$.riskScore").value(95));
    }

    @Test
    @DisplayName("Unregistered agent -> DENY / AGENT_NOT_FOUND")
    void testUnregisteredAgentDenied() throws Exception {
        mockMvc.perform(post("/api/v1/gateway/evaluate")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(payload("ghost-agent", "filesystem", "READ", "src/Main.java"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.decision").value("DENY"))
                .andExpect(jsonPath("$.authorizationResult").value("AGENT_NOT_FOUND"));
    }

    @Test
    @DisplayName("Unregistered tool -> DENY / TOOL_NOT_FOUND")
    void testUnregisteredToolDenied() throws Exception {
        grant(ActionType.READ);

        mockMvc.perform(post("/api/v1/gateway/evaluate")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(payload("deployment-agent", "shell", "READ", "src/Main.java"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.decision").value("DENY"))
                .andExpect(jsonPath("$.authorizationResult").value("TOOL_NOT_FOUND"));
    }

    @Test
    @DisplayName("Audit 22. Authorization denial is audited with authorization result and reason")
    void testAuthorizationDenialAudited() throws Exception {
        grant(ActionType.READ);

        evaluate("WRITE", "src/Main.java");

        AuditLog log = singleAuditLog();
        assertEquals(DecisionType.DENY, log.getDecision());
        assertEquals(ActionOutcome.BLOCKED, log.getActionOutcome());
        assertEquals(AuthorizationResult.UNAUTHORIZED, log.getAuthorizationResult());
        assertTrue(log.getAuthorizationReason().contains("not permitted to perform WRITE"));
        assertTrue(log.getReason().startsWith("Authorization failed:"));
        assertEquals(agent.getId(), log.getRegisteredAgentId());
        assertEquals(filesystem.getId(), log.getRegisteredToolId());
        assertEquals("deployment-agent", log.getAgentId());
        assertEquals("filesystem", log.getTool());
    }

    @Test
    @DisplayName("Audit 22b. Unknown agent denial is audited without resolved ids")
    void testUnknownAgentDenialAudited() throws Exception {
        mockMvc.perform(post("/api/v1/gateway/evaluate")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(payload("ghost-agent", "filesystem", "READ", "src/Main.java"))));

        List<AuditLog> logs = auditRepository.findByAuthorizationResult(AuthorizationResult.AGENT_NOT_FOUND);
        assertEquals(1, logs.size());
        assertEquals("ghost-agent", logs.get(0).getAgentId());
        assertNull(logs.get(0).getRegisteredAgentId());
        assertNull(logs.get(0).getRegisteredToolId());
        assertEquals(DecisionType.DENY, logs.get(0).getDecision());
    }

    @Test
    @DisplayName("Audit 23. Policy denial is audited as AUTHORIZED + DENY")
    void testPolicyDenialAudited() throws Exception {
        grant(ActionType.READ);

        evaluate("READ", ".env");

        AuditLog log = singleAuditLog();
        assertEquals(DecisionType.DENY, log.getDecision());
        assertEquals(ActionOutcome.BLOCKED, log.getActionOutcome());
        assertEquals(AuthorizationResult.AUTHORIZED, log.getAuthorizationResult());
        assertEquals(90, log.getRiskScore());
    }

    @Test
    @DisplayName("Audit 24. REVIEW is audited as AUTHORIZED + REVIEW")
    void testReviewAudited() throws Exception {
        grant(ActionType.DELETE);

        evaluate("DELETE", "dev/temp-file.log");

        AuditLog log = singleAuditLog();
        assertEquals(DecisionType.REVIEW, log.getDecision());
        assertEquals(ActionOutcome.REVIEW_REQUIRED, log.getActionOutcome());
        assertEquals(AuthorizationResult.AUTHORIZED, log.getAuthorizationResult());
    }

    @Test
    @DisplayName("Audit 25. ALLOW is audited as AUTHORIZED + ALLOW")
    void testAllowAudited() throws Exception {
        grant(ActionType.READ);

        evaluate("READ", "src/Main.java");

        AuditLog log = singleAuditLog();
        assertEquals(DecisionType.ALLOW, log.getDecision());
        assertEquals(ActionOutcome.ALLOWED, log.getActionOutcome());
        assertEquals(AuthorizationResult.AUTHORIZED, log.getAuthorizationResult());
        assertEquals(agent.getId(), log.getRegisteredAgentId());
        assertEquals(filesystem.getId(), log.getRegisteredToolId());
    }

    private void grant(ActionType... actions) {
        permissionRepository.save(new AgentToolPermission(agent, filesystem, Set.of(actions), true));
    }

    private ResultActions evaluate(String action, String resource) throws Exception {
        return mockMvc.perform(post("/api/v1/gateway/evaluate")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(payload("deployment-agent", "filesystem", action, resource))))
                .andExpect(status().isOk());
    }

    private Map<String, Object> payload(String agentId, String tool, String action, String resource) {
        return Map.of("agentId", agentId, "sessionId", "session-1", "tool", tool,
                "action", action, "resource", resource);
    }

    private AuditLog singleAuditLog() {
        List<AuditLog> logs = auditRepository.findByAgentId("deployment-agent");
        assertEquals(1, logs.size());
        return logs.get(0);
    }
}
