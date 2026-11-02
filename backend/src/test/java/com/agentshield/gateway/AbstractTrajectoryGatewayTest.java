package com.agentshield.gateway;

import com.agentshield.agent.Agent;
import com.agentshield.agent.AgentRepository;
import com.agentshield.agent.AgentService;
import com.agentshield.audit.AuditLog;
import com.agentshield.audit.AuditRepository;
import com.agentshield.dto.AgentCreateRequest;
import com.agentshield.dto.AgentCreateResponse;
import com.agentshield.model.ActionType;
import com.agentshield.model.RiskTier;
import com.agentshield.model.ToolType;
import com.agentshield.permission.AgentToolPermission;
import com.agentshield.permission.AgentToolPermissionRepository;
import com.agentshield.review.ReviewRequestRepository;
import com.agentshield.riskengine.RiskAssessment;
import com.agentshield.riskengine.RiskAssessmentRepository;
import com.agentshield.riskengine.RiskEngineClient;
import com.agentshield.security.AgentApiKeyAuthenticationFilter;
import com.agentshield.tool.Tool;
import com.agentshield.tool.ToolRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Shared fixture for gateway tests that exercise trajectory analysis. Registers one agent ("traj-agent")
 * with filesystem READ/WRITE/DELETE, read-only notes/search/docs, and an OTHER-typed "egress" tool
 * granted EXTERNAL_REQUEST. The Risk Engine is stubbed to LOW by default.
 */
abstract class AbstractTrajectoryGatewayTest {

    static final String AGENT_ID = "traj-agent";

    @Autowired
    protected MockMvc mockMvc;

    @Autowired
    protected ObjectMapper objectMapper;

    @Autowired
    protected AuditRepository auditRepository;

    @Autowired
    protected RiskAssessmentRepository riskAssessmentRepository;

    @Autowired
    protected ReviewRequestRepository reviewRequestRepository;

    @Autowired
    protected AgentRepository agentRepository;

    @Autowired
    protected ToolRepository toolRepository;

    @Autowired
    protected AgentToolPermissionRepository permissionRepository;

    @Autowired
    protected AgentService agentService;

    @MockitoBean
    protected RiskEngineClient riskEngineClient;

    protected String agentApiKey;

    @BeforeEach
    void setUpAgentFixture() {
        reviewRequestRepository.deleteAll();
        riskAssessmentRepository.deleteAll();
        auditRepository.deleteAll();
        permissionRepository.deleteAll();
        agentRepository.deleteAll();
        toolRepository.deleteAll();

        AgentCreateResponse registered = agentService.registerAgent(new AgentCreateRequest(AGENT_ID, null));
        agentApiKey = registered.apiKey();
        Agent agent = agentRepository.findById(registered.id()).orElseThrow();
        Tool filesystem = toolRepository.save(new Tool("filesystem", null, ToolType.FILESYSTEM));
        Tool notes = toolRepository.save(new Tool("notes", null, ToolType.FILESYSTEM));
        Tool search = toolRepository.save(new Tool("search", null, ToolType.FILESYSTEM));
        Tool docs = toolRepository.save(new Tool("docs", null, ToolType.FILESYSTEM));
        Tool egress = toolRepository.save(new Tool("egress", null, ToolType.OTHER));
        permissionRepository.save(new AgentToolPermission(agent, filesystem, Set.of(ActionType.READ, ActionType.WRITE,
                ActionType.DELETE), true));
        permissionRepository.save(new AgentToolPermission(agent, notes, Set.of(ActionType.READ), true));
        permissionRepository.save(new AgentToolPermission(agent, search, Set.of(ActionType.READ), true));
        permissionRepository.save(new AgentToolPermission(agent, docs, Set.of(ActionType.READ), true));
        permissionRepository.save(new AgentToolPermission(agent, egress, Set.of(ActionType.EXTERNAL_REQUEST), true));

        when(riskEngineClient.assessRisk(any(), any(), any()))
                .thenReturn(new RiskAssessment(50, RiskTier.LOW, List.of(), "LOW risk", true));
    }

    /**
     * Five prior requests in one session that build a HIGH trajectory for the candidate
     * "filesystem READ src/Main.java" (score 60, see TrajectoryGatewayIntegrationTest).
     */
    protected void seedEscalationHistory(String session) throws Exception {
        send(session, "filesystem", "READ", ".env").andExpect(jsonPath("$.decision").value("DENY"));
        send(session, "notes", "READ", "secrets.txt").andExpect(jsonPath("$.decision").value("DENY"));
        send(session, "search", "READ", "keys.pem").andExpect(jsonPath("$.decision").value("DENY"));
        send(session, "docs", "READ", "docs/guide.md").andExpect(jsonPath("$.decision").value("ALLOW"));
        send(session, "filesystem", "READ", "src/notes.md").andExpect(jsonPath("$.decision").value("ALLOW"));
    }

    /** Sends one evaluation and asserts HTTP 200. Returns the result for further assertions. */
    protected ResultActions send(String session, String tool, String action, String resource) throws Exception {
        return mockMvc.perform(post("/api/v1/gateway/evaluate")
                        .header(AgentApiKeyAuthenticationFilter.HEADER, agentApiKey)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("agentId", AGENT_ID, "sessionId", session,
                                "tool", tool, "action", action, "resource", resource))))
                .andExpect(status().isOk());
    }

    protected UUID requestIdOf(ResultActions result) throws Exception {
        UUID requestId = UUID.fromString(objectMapper.readTree(result.andReturn().getResponse().getContentAsString())
                .get("requestId").asText());
        assertNotNull(requestId);
        return requestId;
    }

    protected AuditLog auditFor(UUID requestId) {
        return auditRepository.findByRequestId(requestId).orElseThrow();
    }
}
