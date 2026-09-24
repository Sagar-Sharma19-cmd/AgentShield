package com.agentshield.tool;

import com.agentshield.agent.Agent;
import com.agentshield.agent.AgentRepository;
import com.agentshield.audit.AuditRepository;
import com.agentshield.model.ActionType;
import com.agentshield.model.ToolType;
import com.agentshield.permission.AgentToolPermission;
import com.agentshield.permission.AgentToolPermissionRepository;
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
class ToolControllerIntegrationTest {

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
    @DisplayName("Tool 5. Create tool -> 201, ACTIVE")
    void testCreateTool() throws Exception {
        mockMvc.perform(post("/api/v1/tools")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json(Map.of("name", "filesystem", "description", "Local files", "toolType", "FILESYSTEM"))))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.id").isNotEmpty())
                .andExpect(jsonPath("$.name").value("filesystem"))
                .andExpect(jsonPath("$.toolType").value("FILESYSTEM"))
                .andExpect(jsonPath("$.status").value("ACTIVE"));
    }

    @Test
    @DisplayName("Tool 6. Get tool by id and list tools")
    void testGetTool() throws Exception {
        Tool tool = toolRepository.save(new Tool("database", "Postgres", ToolType.DATABASE));

        mockMvc.perform(get("/api/v1/tools/{id}", tool.getId()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value("database"))
                .andExpect(jsonPath("$.toolType").value("DATABASE"));

        mockMvc.perform(get("/api/v1/tools"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1));
    }

    @Test
    @DisplayName("Tool 7. Disable tool -> status DISABLED")
    void testDisableTool() throws Exception {
        Tool tool = toolRepository.save(new Tool("filesystem", null, ToolType.FILESYSTEM));

        mockMvc.perform(patch("/api/v1/tools/{id}/status", tool.getId())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json(Map.of("status", "DISABLED"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("DISABLED"));
    }

    @Test
    @DisplayName("Tool 8. Disabled tool cannot be used -> DENY / TOOL_DISABLED")
    void testDisabledToolCannotBeUsed() throws Exception {
        Agent agent = agentRepository.save(new Agent("research-agent", null));
        Tool tool = toolRepository.save(new Tool("filesystem", null, ToolType.FILESYSTEM));
        permissionRepository.save(new AgentToolPermission(agent, tool, Set.of(ActionType.READ), true));

        mockMvc.perform(patch("/api/v1/tools/{id}/status", tool.getId())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json(Map.of("status", "DISABLED"))))
                .andExpect(status().isOk());

        mockMvc.perform(post("/api/v1/gateway/evaluate")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json(Map.of("agentId", "research-agent", "sessionId", "s-1",
                                "action", "READ", "resource", "src/Main.java", "tool", "filesystem"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.decision").value("DENY"))
                .andExpect(jsonPath("$.authorizationResult").value("TOOL_DISABLED"));
    }

    @Test
    @DisplayName("Duplicate tool name -> 409")
    void testDuplicateToolName() throws Exception {
        toolRepository.save(new Tool("filesystem", null, ToolType.FILESYSTEM));

        mockMvc.perform(post("/api/v1/tools")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json(Map.of("name", "filesystem", "toolType", "FILESYSTEM"))))
                .andExpect(status().isConflict());
    }

    @Test
    @DisplayName("Missing toolType -> 400, unknown tool id -> 404")
    void testValidationAndNotFound() throws Exception {
        mockMvc.perform(post("/api/v1/tools")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json(Map.of("name", "filesystem"))))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.fieldErrors.toolType").exists());

        mockMvc.perform(get("/api/v1/tools/{id}", "00000000-0000-0000-0000-000000000000"))
                .andExpect(status().isNotFound());
    }

    private String json(Object value) throws Exception {
        return objectMapper.writeValueAsString(value);
    }
}
