package com.agentshield.permission;

import com.agentshield.agent.Agent;
import com.agentshield.agent.AgentRepository;
import com.agentshield.audit.AuditRepository;
import com.agentshield.model.ActionType;
import com.agentshield.model.AgentStatus;
import com.agentshield.model.ToolType;
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

import java.util.List;
import java.util.Map;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class PermissionControllerIntegrationTest {

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
    private Tool tool;

    @BeforeEach
    void setUp() {
        auditRepository.deleteAll();
        permissionRepository.deleteAll();
        agentRepository.deleteAll();
        toolRepository.deleteAll();

        agent = agentRepository.save(new Agent("research-agent", null));
        tool = toolRepository.save(new Tool("filesystem", null, ToolType.FILESYSTEM));
    }

    @Test
    @DisplayName("Permission 9. Grant READ permission -> 201, enabled by default")
    void testGrantReadPermission() throws Exception {
        mockMvc.perform(post("/api/v1/permissions")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json(Map.of("agentId", agent.getId(), "toolId", tool.getId(),
                                "allowedActions", List.of("READ")))))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.id").isNotEmpty())
                .andExpect(jsonPath("$.agentName").value("research-agent"))
                .andExpect(jsonPath("$.toolName").value("filesystem"))
                .andExpect(jsonPath("$.allowedActions.length()").value(1))
                .andExpect(jsonPath("$.allowedActions[0]").value("READ"))
                .andExpect(jsonPath("$.enabled").value(true));

        mockMvc.perform(get("/api/v1/permissions/agent/{agentId}", agent.getId()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].toolName").value("filesystem"));
    }

    @Test
    @DisplayName("Delete permission -> 204 and grant removed")
    void testDeletePermission() throws Exception {
        AgentToolPermission permission = permissionRepository.save(
                new AgentToolPermission(agent, tool, Set.of(ActionType.READ), true));

        mockMvc.perform(delete("/api/v1/permissions/{id}", permission.getId()))
                .andExpect(status().isNoContent());

        assertFalse(permissionRepository.existsById(permission.getId()));

        mockMvc.perform(delete("/api/v1/permissions/{id}", permission.getId()))
                .andExpect(status().isNotFound());
    }

    @Test
    @DisplayName("Duplicate grant for same agent+tool -> 409")
    void testDuplicateGrant() throws Exception {
        permissionRepository.save(new AgentToolPermission(agent, tool, Set.of(ActionType.READ), true));

        mockMvc.perform(post("/api/v1/permissions")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json(Map.of("agentId", agent.getId(), "toolId", tool.getId(),
                                "allowedActions", List.of("WRITE")))))
                .andExpect(status().isConflict());
        assertEquals(1, permissionRepository.count());
    }

    @Test
    @DisplayName("Empty allowedActions -> 400; unknown agent -> 404; revoked agent -> 409")
    void testGrantValidation() throws Exception {
        mockMvc.perform(post("/api/v1/permissions")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json(Map.of("agentId", agent.getId(), "toolId", tool.getId(),
                                "allowedActions", List.of()))))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.fieldErrors.allowedActions").exists());

        mockMvc.perform(post("/api/v1/permissions")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json(Map.of("agentId", "00000000-0000-0000-0000-000000000000",
                                "toolId", tool.getId(), "allowedActions", List.of("READ")))))
                .andExpect(status().isNotFound());

        agent.setStatus(AgentStatus.REVOKED);
        agentRepository.save(agent);
        mockMvc.perform(post("/api/v1/permissions")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json(Map.of("agentId", agent.getId(), "toolId", tool.getId(),
                                "allowedActions", List.of("READ")))))
                .andExpect(status().isConflict());
    }

    private String json(Object value) throws Exception {
        return objectMapper.writeValueAsString(value);
    }
}
