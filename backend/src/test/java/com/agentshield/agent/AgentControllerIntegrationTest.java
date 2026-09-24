package com.agentshield.agent;

import com.agentshield.audit.AuditRepository;
import com.agentshield.model.ActionType;
import com.agentshield.model.AgentStatus;
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
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import java.util.Map;
import java.util.Set;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class AgentControllerIntegrationTest {

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
    }

    @Test
    @DisplayName("Agent 1. Create agent -> 201, ACTIVE, UUID id")
    void testCreateAgent() throws Exception {
        mockMvc.perform(post("/api/v1/agents")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json(Map.of("name", "research-agent", "description", "Reads source code"))))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.id").isNotEmpty())
                .andExpect(jsonPath("$.name").value("research-agent"))
                .andExpect(jsonPath("$.description").value("Reads source code"))
                .andExpect(jsonPath("$.status").value("ACTIVE"))
                .andExpect(jsonPath("$.createdAt").isNotEmpty())
                .andExpect(jsonPath("$.updatedAt").isNotEmpty());
    }

    @Test
    @DisplayName("Agent 2. Get agent by id and list agents")
    void testGetAgent() throws Exception {
        String id = createAgent("research-agent");

        mockMvc.perform(get("/api/v1/agents/{id}", id))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(id))
                .andExpect(jsonPath("$.name").value("research-agent"));

        mockMvc.perform(get("/api/v1/agents"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].name").value("research-agent"));
    }

    @Test
    @DisplayName("Agent 3. Suspend agent -> status SUSPENDED")
    void testSuspendAgent() throws Exception {
        String id = createAgent("research-agent");

        mockMvc.perform(patch("/api/v1/agents/{id}/status", id)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json(Map.of("status", "SUSPENDED"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("SUSPENDED"));

        mockMvc.perform(get("/api/v1/agents/{id}", id))
                .andExpect(jsonPath("$.status").value("SUSPENDED"));
    }

    @Test
    @DisplayName("Agent 4. Revoked agent cannot make requests -> DENY / AGENT_REVOKED")
    void testRevokedAgentCannotMakeRequests() throws Exception {
        Agent agent = agentRepository.save(new Agent("research-agent", null));
        Tool tool = toolRepository.save(new Tool("filesystem", null, ToolType.FILESYSTEM));
        permissionRepository.save(new AgentToolPermission(agent, tool, Set.of(ActionType.READ), true));

        mockMvc.perform(patch("/api/v1/agents/{id}/status", agent.getId())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json(Map.of("status", "REVOKED"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("REVOKED"));

        mockMvc.perform(post("/api/v1/gateway/evaluate")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json(Map.of("agentId", "research-agent", "sessionId", "s-1",
                                "action", "READ", "resource", "src/Main.java", "tool", "filesystem"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.decision").value("DENY"))
                .andExpect(jsonPath("$.authorizationResult").value("AGENT_REVOKED"));
    }

    @Test
    @DisplayName("Revoked agent cannot be re-activated -> 409")
    void testRevokedAgentCannotBeReactivated() throws Exception {
        Agent agent = new Agent("research-agent", null);
        agent.setStatus(AgentStatus.REVOKED);
        agent = agentRepository.save(agent);

        mockMvc.perform(patch("/api/v1/agents/{id}/status", agent.getId())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json(Map.of("status", "ACTIVE"))))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.status").value(409));
    }

    @Test
    @DisplayName("Duplicate agent name -> 409")
    void testDuplicateAgentName() throws Exception {
        createAgent("research-agent");

        mockMvc.perform(post("/api/v1/agents")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json(Map.of("name", "research-agent"))))
                .andExpect(status().isConflict());
    }

    @Test
    @DisplayName("Invalid agent name -> 400 validation failure")
    void testInvalidAgentName() throws Exception {
        mockMvc.perform(post("/api/v1/agents")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json(Map.of("name", "Bad Name!"))))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.fieldErrors.name").exists());
    }

    @Test
    @DisplayName("Unknown agent id -> 404, malformed id -> 400")
    void testUnknownAgent() throws Exception {
        mockMvc.perform(get("/api/v1/agents/{id}", "00000000-0000-0000-0000-000000000000"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.status").value(404));

        mockMvc.perform(get("/api/v1/agents/{id}", "not-a-uuid"))
                .andExpect(status().isBadRequest());
    }

    private String createAgent(String name) throws Exception {
        String body = mockMvc.perform(post("/api/v1/agents")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json(Map.of("name", name))))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        JsonNode node = objectMapper.readTree(body);
        return node.get("id").asText();
    }

    private String json(Object value) throws Exception {
        return objectMapper.writeValueAsString(value);
    }
}
