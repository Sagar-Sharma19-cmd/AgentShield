package com.agentshield.security;

import com.agentshield.agent.Agent;
import com.agentshield.agent.AgentRepository;
import com.agentshield.agent.AgentService;
import com.agentshield.audit.AuditRepository;
import com.agentshield.dto.AgentCreateRequest;
import com.agentshield.dto.AgentCreateResponse;
import com.agentshield.model.ActionType;
import com.agentshield.model.ToolType;
import com.agentshield.permission.AgentToolPermission;
import com.agentshield.permission.AgentToolPermissionRepository;
import com.agentshield.tool.Tool;
import com.agentshield.tool.ToolRepository;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

import java.util.List;
import java.util.Map;
import java.util.Set;

import static org.hamcrest.Matchers.containsString;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Agent and admin API key authentication, key rotation and revocation.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class ApiKeyAuthenticationIntegrationTest {

    private static final String AGENT_HEADER = AgentApiKeyAuthenticationFilter.HEADER;
    private static final String ADMIN_HEADER = AdminApiKeyAuthenticationFilter.HEADER;

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private JdbcTemplate jdbcTemplate;

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

    @Autowired
    private ApiKeyHasher apiKeyHasher;

    @Value("${agentshield.security.admin-api-key}")
    private String adminApiKey;

    private AgentCreateResponse registered;

    @BeforeEach
    void setUp() {
        auditRepository.deleteAll();
        permissionRepository.deleteAll();
        agentRepository.deleteAll();
        toolRepository.deleteAll();

        registered = agentService.registerAgent(new AgentCreateRequest("research-agent", null));
        Agent agent = agentRepository.findById(registered.id()).orElseThrow();
        Tool filesystem = toolRepository.save(new Tool("filesystem", null, ToolType.FILESYSTEM));
        permissionRepository.save(new AgentToolPermission(agent, filesystem, Set.of(ActionType.READ), true));
    }

    // ---------- Key storage ----------

    @Test
    @DisplayName("Only the HMAC hash and display prefix are stored — never the plaintext key")
    void testPlaintextKeyNeverStored() {
        Agent agent = agentRepository.findById(registered.id()).orElseThrow();
        String storedHash = jdbcTemplate.queryForObject(
                "SELECT api_key_hash FROM agents WHERE id = ?", String.class, registered.id());

        assertEquals(apiKeyHasher.hash(registered.apiKey()), storedHash);
        assertNotEquals(registered.apiKey(), storedHash);
        assertEquals(registered.apiKey().substring(0, 13), agent.getApiKeyPrefix());

        List<Map<String, Object>> rows = jdbcTemplate.queryForList("SELECT * FROM agents");
        rows.forEach(row -> row.values().forEach(value ->
                assertFalse(String.valueOf(value).contains(registered.apiKey().substring(9)),
                        "plaintext key material found in agents table")));
    }

    // ---------- Gateway authentication ----------

    @Test
    @DisplayName("Valid agent key -> request evaluated (ALLOW)")
    void testValidKeyAccepted() throws Exception {
        evaluate(AGENT_HEADER, registered.apiKey())
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.decision").value("ALLOW"));
    }

    @Test
    @DisplayName("Missing agent key -> 401 with WWW-Authenticate, nothing audited")
    void testMissingKeyRejected() throws Exception {
        mockMvc.perform(post("/api/v1/gateway/evaluate")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(payload()))
                .andExpect(status().isUnauthorized())
                .andExpect(header().string("WWW-Authenticate", containsString("Bearer")))
                .andExpect(jsonPath("$.status").value(401))
                .andExpect(jsonPath("$.message").value("Missing or invalid API key"));

        assertEquals(0, auditRepository.count());
    }

    @Test
    @DisplayName("Unknown well-formed key, malformed key and bearer garbage -> 401")
    void testInvalidKeysRejected() throws Exception {
        evaluate(AGENT_HEADER, "agk_live_" + "A".repeat(32)).andExpect(status().isUnauthorized());
        evaluate(AGENT_HEADER, "not-a-key").andExpect(status().isUnauthorized());
        evaluate(AGENT_HEADER, registered.apiKey() + "x").andExpect(status().isUnauthorized());
        evaluate("Authorization", "Bearer agk_live_nope").andExpect(status().isUnauthorized());
    }

    @Test
    @DisplayName("Conflicting X-Agent-API-Key and Bearer credentials -> 401")
    void testConflictingCredentialsRejected() throws Exception {
        AgentCreateResponse other = agentService.registerAgent(new AgentCreateRequest("other-agent", null));

        mockMvc.perform(post("/api/v1/gateway/evaluate")
                        .header(AGENT_HEADER, registered.apiKey())
                        .header("Authorization", "Bearer " + other.apiKey())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(payload()))
                .andExpect(status().isUnauthorized());
    }

    @Test
    @DisplayName("Admin key is not accepted on the gateway")
    void testAdminKeyRejectedOnGateway() throws Exception {
        evaluate(AGENT_HEADER, adminApiKey).andExpect(status().isUnauthorized());
        evaluate(ADMIN_HEADER, adminApiKey).andExpect(status().isUnauthorized());
    }

    @Test
    @DisplayName("Suspended agent still authenticates, but is DENIED and audited as AGENT_SUSPENDED")
    void testSuspendedAgentAuthenticatesButDenied() throws Exception {
        mockMvc.perform(patch("/api/v1/agents/{id}/status", registered.id())
                        .header(ADMIN_HEADER, adminApiKey)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"status\":\"SUSPENDED\"}"))
                .andExpect(status().isOk());

        evaluate(AGENT_HEADER, registered.apiKey())
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.decision").value("DENY"))
                .andExpect(jsonPath("$.authorizationResult").value("AGENT_SUSPENDED"));
        assertEquals(1, auditRepository.count());
    }

    // ---------- Rotation & revocation ----------

    @Test
    @DisplayName("Rotate key -> new key works, old key is rejected immediately")
    void testKeyRotation() throws Exception {
        String body = mockMvc.perform(post("/api/v1/agents/{id}/rotate-key", registered.id())
                        .header(ADMIN_HEADER, adminApiKey))
                .andExpect(status().isOk())
                .andExpect(header().string("Cache-Control", "no-store"))
                .andExpect(jsonPath("$.apiKey").isNotEmpty())
                .andReturn().getResponse().getContentAsString();
        JsonNode rotated = objectMapper.readTree(body);
        String newKey = rotated.get("apiKey").asText();

        assertNotEquals(registered.apiKey(), newKey);
        assertEquals(newKey.substring(0, 13), rotated.get("apiKeyPrefix").asText());
        evaluate(AGENT_HEADER, registered.apiKey()).andExpect(status().isUnauthorized());
        evaluate(AGENT_HEADER, newKey).andExpect(status().isOk()).andExpect(jsonPath("$.decision").value("ALLOW"));
    }

    @Test
    @DisplayName("Revoke agent -> key invalidated immediately and hash destroyed")
    void testRevocationInvalidatesKey() throws Exception {
        evaluate(AGENT_HEADER, registered.apiKey()).andExpect(status().isOk());

        mockMvc.perform(patch("/api/v1/agents/{id}/status", registered.id())
                        .header(ADMIN_HEADER, adminApiKey)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"status\":\"REVOKED\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.apiKeyPrefix").doesNotExist());

        evaluate(AGENT_HEADER, registered.apiKey()).andExpect(status().isUnauthorized());
        assertNull(jdbcTemplate.queryForObject(
                "SELECT api_key_hash FROM agents WHERE id = ?", String.class, registered.id()));
    }

    @Test
    @DisplayName("Rotating a revoked agent's key -> 409; unknown agent -> 404")
    void testRotateRevokedOrUnknownAgent() throws Exception {
        agentService.updateStatus(registered.id(), com.agentshield.model.AgentStatus.REVOKED);

        mockMvc.perform(post("/api/v1/agents/{id}/rotate-key", registered.id()).header(ADMIN_HEADER, adminApiKey))
                .andExpect(status().isConflict());
        mockMvc.perform(post("/api/v1/agents/{id}/rotate-key", "00000000-0000-0000-0000-000000000000")
                        .header(ADMIN_HEADER, adminApiKey))
                .andExpect(status().isNotFound());
    }

    // ---------- Admin API protection ----------

    @Test
    @DisplayName("Admin APIs without a key -> 401 on every admin resource")
    void testAdminApisRequireKey() throws Exception {
        mockMvc.perform(get("/api/v1/agents")).andExpect(status().isUnauthorized())
                .andExpect(header().string("WWW-Authenticate", containsString("agentshield-admin")));
        mockMvc.perform(get("/api/v1/tools")).andExpect(status().isUnauthorized());
        mockMvc.perform(get("/api/v1/permissions/agent/{id}", registered.id())).andExpect(status().isUnauthorized());
        mockMvc.perform(post("/api/v1/agents").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"sneaky-agent\"}"))
                .andExpect(status().isUnauthorized());
        mockMvc.perform(post("/api/v1/agents/{id}/rotate-key", registered.id())).andExpect(status().isUnauthorized());

        assertFalse(agentRepository.existsByName("sneaky-agent"));
    }

    @Test
    @DisplayName("Wrong admin key or an agent key on admin APIs -> 401")
    void testWrongCredentialsOnAdminApis() throws Exception {
        mockMvc.perform(get("/api/v1/agents").header(ADMIN_HEADER, adminApiKey + "x"))
                .andExpect(status().isUnauthorized());
        mockMvc.perform(get("/api/v1/agents").header(ADMIN_HEADER, registered.apiKey()))
                .andExpect(status().isUnauthorized());
        mockMvc.perform(get("/api/v1/agents").header(AGENT_HEADER, registered.apiKey()))
                .andExpect(status().isUnauthorized());
        mockMvc.perform(get("/api/v1/agents").header("Authorization", "Bearer " + registered.apiKey()))
                .andExpect(status().isUnauthorized());
    }

    @Test
    @DisplayName("Valid admin key -> admin API accessible")
    void testValidAdminKey() throws Exception {
        mockMvc.perform(get("/api/v1/agents").header(ADMIN_HEADER, adminApiKey))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].name").value("research-agent"))
                .andExpect(jsonPath("$[0].apiKey").doesNotExist());
    }

    // ---------- Everything else ----------

    @Test
    @DisplayName("Health endpoint is public; unmapped paths are denied")
    void testPublicAndDeniedPaths() throws Exception {
        mockMvc.perform(get("/actuator/health")).andExpect(status().isOk());
        mockMvc.perform(get("/api/v1/unknown")).andExpect(status().isUnauthorized());
        mockMvc.perform(get("/api/v1/unknown").header(ADMIN_HEADER, adminApiKey)).andExpect(status().isUnauthorized());
    }

    private ResultActions evaluate(String headerName, String headerValue) throws Exception {
        return mockMvc.perform(post("/api/v1/gateway/evaluate")
                .header(headerName, headerValue)
                .contentType(MediaType.APPLICATION_JSON)
                .content(payload()));
    }

    private String payload() throws Exception {
        return objectMapper.writeValueAsString(Map.of("agentId", "research-agent", "sessionId", "s-1",
                "tool", "filesystem", "action", "READ", "resource", "src/Main.java"));
    }
}
