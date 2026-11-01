package com.agentshield.gateway;

import com.agentshield.agent.Agent;
import com.agentshield.agent.AgentRepository;
import com.agentshield.agent.AgentService;
import com.agentshield.audit.AuditLog;
import com.agentshield.audit.AuditRepository;
import com.agentshield.dto.AgentCreateRequest;
import com.agentshield.dto.AgentCreateResponse;
import com.agentshield.model.ActionType;
import com.agentshield.model.DecisionType;
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
import com.agentshield.trajectory.TrajectoryService;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * When trajectory analysis cannot run (history query failed), the existing decision is preserved,
 * no trajectory score is invented, and the review row records trajectory as not evaluated.
 * TrajectoryService is mocked to return "not evaluated". The try/catch that produces that result is
 * covered by TrajectoryServiceTest.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class TrajectoryHistoryFailureGatewayTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private AuditRepository auditRepository;

    @Autowired
    private RiskAssessmentRepository riskAssessmentRepository;

    @Autowired
    private ReviewRequestRepository reviewRequestRepository;

    @Autowired
    private AgentRepository agentRepository;

    @Autowired
    private ToolRepository toolRepository;

    @Autowired
    private AgentToolPermissionRepository permissionRepository;

    @Autowired
    private AgentService agentService;

    @MockitoBean
    private RiskEngineClient riskEngineClient;

    @MockitoBean
    private TrajectoryService trajectoryService;

    private String agentApiKey;

    @BeforeEach
    void setUp() {
        reviewRequestRepository.deleteAll();
        riskAssessmentRepository.deleteAll();
        auditRepository.deleteAll();
        permissionRepository.deleteAll();
        agentRepository.deleteAll();
        toolRepository.deleteAll();

        AgentCreateResponse registered = agentService.registerAgent(new AgentCreateRequest("failure-agent", null));
        agentApiKey = registered.apiKey();
        Agent agent = agentRepository.findById(registered.id()).orElseThrow();
        Tool filesystem = toolRepository.save(new Tool("filesystem", null, ToolType.FILESYSTEM));
        permissionRepository.save(new AgentToolPermission(agent, filesystem, Set.of(ActionType.READ), true));

        when(riskEngineClient.assessRisk(any(), any(), any()))
                .thenReturn(new RiskAssessment(50, RiskTier.LOW, List.of(), "LOW risk", true));
        when(trajectoryService.evaluate(any(), any(), any(), any())).thenReturn(Optional.empty());
    }

    @Test
    @DisplayName("History query failure: ALLOW is preserved, no review is created, and the audit row keeps the policy decision")
    void historyFailurePreservesDecision() throws Exception {
        mockMvc.perform(post("/api/v1/gateway/evaluate")
                        .header(AgentApiKeyAuthenticationFilter.HEADER, agentApiKey)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("agentId", "failure-agent",
                                "sessionId", "s-failure", "tool", "filesystem", "action", "READ",
                                "resource", "src/Main.java"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.decision").value("ALLOW"))
                .andExpect(jsonPath("$.riskScore").value(10))
                .andExpect(jsonPath("$.reviewRequestId").doesNotExist());

        verify(trajectoryService).evaluate(any(), eq("s-failure"), any(), any());

        List<AuditLog> logs = auditRepository.findByAgentId("failure-agent");
        assertEquals(1, logs.size());
        assertEquals(DecisionType.ALLOW, logs.get(0).getDecision());
        assertEquals(0, reviewRequestRepository.findAll().size());
        assertEquals(1, riskAssessmentRepository.findAll().size());
    }
}
