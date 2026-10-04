package com.agentshield.audit;

import com.agentshield.agent.Agent;
import com.agentshield.agent.AgentRepository;
import com.agentshield.agent.AgentService;
import com.agentshield.dto.AgentCreateRequest;
import com.agentshield.dto.AgentCreateResponse;
import com.agentshield.model.ActionOutcome;
import com.agentshield.model.ActionType;
import com.agentshield.model.AuthorizationResult;
import com.agentshield.model.DecisionType;
import com.agentshield.model.ResourceSensitivity;
import com.agentshield.model.ToolType;
import com.agentshield.permission.AgentToolPermission;
import com.agentshield.permission.AgentToolPermissionRepository;
import com.agentshield.security.AdminApiKeyAuthenticationFilter;
import com.agentshield.security.AgentApiKeyAuthenticationFilter;
import com.agentshield.tool.Tool;
import com.agentshield.tool.ToolRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import java.time.Instant;
import java.util.HashMap;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Phase 4 — Audit Read API: GET /api/v1/audit/{requestId}, GET /api/v1/audit (filters,
 * pagination, validation), the admin-only security boundary, a regression check that the
 * gateway's existing audit persistence is untouched, and requestId correlation between a
 * live gateway evaluation and the new read API.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class AuditControllerIntegrationTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Value("${agentshield.security.admin-api-key}")
    private String adminApiKey;

    @Autowired
    private AuditRepository auditRepository;

    @Autowired
    private AgentRepository agentRepository;

    @Autowired
    private ToolRepository toolRepository;

    @Autowired
    private AgentToolPermissionRepository permissionRepository;

    @Autowired
    private AgentService agentService;

    private String agentApiKey;

    @BeforeEach
    void setUp() {
        auditRepository.deleteAll();
        permissionRepository.deleteAll();
        agentRepository.deleteAll();
        toolRepository.deleteAll();

        AgentCreateResponse registered =
                agentService.registerAgent(new AgentCreateRequest("audit-test-agent", "Audit API test agent"));
        agentApiKey = registered.apiKey();
        Agent agent = agentRepository.findById(registered.id()).orElseThrow();
        Tool tool = toolRepository.save(new Tool("audit-test-tool", "Audit API test tool", ToolType.FILESYSTEM));
        permissionRepository.save(new AgentToolPermission(agent, tool, Set.of(ActionType.READ, ActionType.DELETE), true));
    }

    @Test
    @DisplayName("GET /audit/{requestId} -> 200 for a persisted audit row")
    void testGetByRequestIdFound() throws Exception {
        AuditLog log = persist(UUID.randomUUID(), "agent-a", DecisionType.ALLOW);

        mockMvc.perform(get("/api/v1/audit/{requestId}", log.getRequestId())
                        .header(AdminApiKeyAuthenticationFilter.HEADER, adminApiKey))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.requestId").value(log.getRequestId().toString()))
                .andExpect(jsonPath("$.agentId").value("agent-a"))
                .andExpect(jsonPath("$.decision").value("ALLOW"));
    }

    @Test
    @DisplayName("GET /audit/{requestId} -> 404 for an unknown requestId")
    void testGetByRequestIdNotFound() throws Exception {
        mockMvc.perform(get("/api/v1/audit/{requestId}", UUID.randomUUID())
                        .header(AdminApiKeyAuthenticationFilter.HEADER, adminApiKey))
                .andExpect(status().isNotFound());
    }

    @Test
    @DisplayName("GET /audit/{requestId} -> 400 for a malformed requestId")
    void testGetByRequestIdMalformed() throws Exception {
        mockMvc.perform(get("/api/v1/audit/{requestId}", "not-a-uuid")
                        .header(AdminApiKeyAuthenticationFilter.HEADER, adminApiKey))
                .andExpect(status().isBadRequest());
    }

    @Test
    @DisplayName("GET /audit -> 200, default pagination")
    void testListDefaultPagination() throws Exception {
        for (int i = 0; i < 3; i++) {
            persist(UUID.randomUUID(), "agent-a", DecisionType.ALLOW);
        }

        mockMvc.perform(get("/api/v1/audit")
                        .header(AdminApiKeyAuthenticationFilter.HEADER, adminApiKey))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content.length()").value(3))
                .andExpect(jsonPath("$.page").value(0))
                .andExpect(jsonPath("$.totalElements").value(3));
    }

    @Test
    @DisplayName("GET /audit?agentId= filters results")
    void testListFilterByAgentId() throws Exception {
        persist(UUID.randomUUID(), "agent-a", DecisionType.ALLOW);
        persist(UUID.randomUUID(), "agent-b", DecisionType.ALLOW);

        mockMvc.perform(get("/api/v1/audit").param("agentId", "agent-a")
                        .header(AdminApiKeyAuthenticationFilter.HEADER, adminApiKey))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(1))
                .andExpect(jsonPath("$.content[0].agentId").value("agent-a"));
    }

    @Test
    @DisplayName("GET /audit?decision=DENY filters results")
    void testListFilterByDecision() throws Exception {
        persist(UUID.randomUUID(), "agent-a", DecisionType.ALLOW);
        persist(UUID.randomUUID(), "agent-a", DecisionType.DENY);

        mockMvc.perform(get("/api/v1/audit").param("decision", "DENY")
                        .header(AdminApiKeyAuthenticationFilter.HEADER, adminApiKey))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(1))
                .andExpect(jsonPath("$.content[0].decision").value("DENY"));
    }

    @Test
    @DisplayName("GET /audit?page=1&size=2 paginates correctly")
    void testListPagination() throws Exception {
        for (int i = 0; i < 5; i++) {
            persist(UUID.randomUUID(), "agent-a", DecisionType.ALLOW);
        }

        mockMvc.perform(get("/api/v1/audit").param("page", "1").param("size", "2")
                        .header(AdminApiKeyAuthenticationFilter.HEADER, adminApiKey))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content.length()").value(2))
                .andExpect(jsonPath("$.page").value(1))
                .andExpect(jsonPath("$.totalPages").value(3));
    }

    @Test
    @DisplayName("GET /audit?page=-1 -> 400 (invalid page)")
    void testListInvalidPage() throws Exception {
        mockMvc.perform(get("/api/v1/audit").param("page", "-1")
                        .header(AdminApiKeyAuthenticationFilter.HEADER, adminApiKey))
                .andExpect(status().isBadRequest());
    }

    @Test
    @DisplayName("GET /audit?size=0 -> 400 (invalid size)")
    void testListInvalidSize() throws Exception {
        mockMvc.perform(get("/api/v1/audit").param("size", "0")
                        .header(AdminApiKeyAuthenticationFilter.HEADER, adminApiKey))
                .andExpect(status().isBadRequest());
    }

    @Test
    @DisplayName("GET /audit?size=1000 -> 400 (excessive size)")
    void testListExcessiveSize() throws Exception {
        mockMvc.perform(get("/api/v1/audit").param("size", "1000")
                        .header(AdminApiKeyAuthenticationFilter.HEADER, adminApiKey))
                .andExpect(status().isBadRequest());
    }

    @Test
    @DisplayName("Security: admin API key is accepted on the audit endpoints")
    void testAdminKeyAccepted() throws Exception {
        mockMvc.perform(get("/api/v1/audit")
                        .header(AdminApiKeyAuthenticationFilter.HEADER, adminApiKey))
                .andExpect(status().isOk());
    }

    @Test
    @DisplayName("Security: an agent API key is rejected on the audit endpoints")
    void testAgentKeyRejected() throws Exception {
        mockMvc.perform(get("/api/v1/audit")
                        .header(AgentApiKeyAuthenticationFilter.HEADER, agentApiKey))
                .andExpect(status().isUnauthorized());
    }

    @Test
    @DisplayName("Security: no API key is rejected on the audit endpoints")
    void testNoKeyRejected() throws Exception {
        mockMvc.perform(get("/api/v1/audit"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    @DisplayName("Regression: gateway evaluation still persists its audit row")
    void testGatewayPersistenceRegression() throws Exception {
        mockMvc.perform(post("/api/v1/gateway/evaluate")
                        .header(AgentApiKeyAuthenticationFilter.HEADER, agentApiKey)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(gatewayPayload())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.decision").value("ALLOW"));

        assertEquals(1, auditRepository.findByAgentId("audit-test-agent").size());
    }

    @Test
    @DisplayName("Correlation: a gateway evaluation's requestId resolves to the same row via GET /audit/{requestId}")
    void testCorrelationBetweenGatewayAndAuditApi() throws Exception {
        String response = mockMvc.perform(post("/api/v1/gateway/evaluate")
                        .header(AgentApiKeyAuthenticationFilter.HEADER, agentApiKey)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(gatewayPayload())))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();

        String requestId = objectMapper.readTree(response).get("requestId").asText();

        mockMvc.perform(get("/api/v1/audit/{requestId}", requestId)
                        .header(AdminApiKeyAuthenticationFilter.HEADER, adminApiKey))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.requestId").value(requestId))
                .andExpect(jsonPath("$.agentId").value("audit-test-agent"))
                .andExpect(jsonPath("$.decision").value("ALLOW"))
                .andExpect(jsonPath("$.resource").value("src/main/App.java"));
    }

    private Map<String, Object> gatewayPayload() {
        Map<String, Object> map = new HashMap<>();
        map.put("agentId", "audit-test-agent");
        map.put("sessionId", "session-xyz");
        map.put("action", ActionType.READ.name());
        map.put("resource", "src/main/App.java");
        map.put("tool", "audit-test-tool");
        return map;
    }

    private AuditLog persist(UUID requestId, String agentId, DecisionType decision) {
        AuditLog log = AuditLog.builder()
                .requestId(requestId)
                .agentId(agentId)
                .sessionId("session-1")
                .tool("filesystem")
                .action(ActionType.READ)
                .resource("src/main/App.java")
                .resourceSensitivity(ResourceSensitivity.INTERNAL)
                .decision(decision)
                .riskScore(10)
                .reason("test")
                .actionOutcome(decision == DecisionType.ALLOW ? ActionOutcome.ALLOWED : ActionOutcome.BLOCKED)
                .authorizationResult(AuthorizationResult.AUTHORIZED)
                .authorizationReason("ok")
                .timestamp(Instant.now())
                .build();
        return auditRepository.save(log);
    }
}
