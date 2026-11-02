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
import com.agentshield.model.ReviewStatus;
import com.agentshield.model.ToolType;
import com.agentshield.permission.AgentToolPermission;
import com.agentshield.permission.AgentToolPermissionRepository;
import com.agentshield.review.ReviewRequest;
import com.agentshield.review.ReviewRequestRepository;
import com.agentshield.riskengine.RiskAssessment;
import com.agentshield.riskengine.RiskAssessmentRecord;
import com.agentshield.riskengine.RiskAssessmentRepository;
import com.agentshield.riskengine.RiskEngineClient;
import com.agentshield.security.AgentApiKeyAuthenticationFilter;
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
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Trajectory analysis through the real gateway: session history is built with real requests, and
 * the escalation (or its absence) is checked in the response, the audit row, the review row, and the
 * Risk Engine's own record. RiskEngineClient is mocked at a fixed LOW tier, so trajectory is the only
 * escalation signal in these tests.
 *
 * Escalation sequence (one session, one agent, all within 60 seconds):
 *   3 DENY reads on 3 tools (denials 30, plus 3 prior tools)
 *   2 ALLOW reads on 2 tools (docs, filesystem) - each scores 45 (MEDIUM), so ALLOW stays ALLOW
 *   candidate: ALLOW read on filesystem, scoring 30 + 15 (4 tools) + 15 (5 events in 60s) = 60 HIGH -> REVIEW
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class TrajectoryGatewayIntegrationTest {

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

    private Agent agent;
    private String agentApiKey;
    private Tool filesystem;
    private Tool notes;
    private Tool search;
    private Tool docs;

    @BeforeEach
    void setUp() {
        reviewRequestRepository.deleteAll();
        riskAssessmentRepository.deleteAll();
        auditRepository.deleteAll();
        permissionRepository.deleteAll();
        agentRepository.deleteAll();
        toolRepository.deleteAll();

        AgentCreateResponse registered = agentService.registerAgent(new AgentCreateRequest("traj-agent", null));
        agentApiKey = registered.apiKey();
        agent = agentRepository.findById(registered.id()).orElseThrow();
        filesystem = toolRepository.save(new Tool("filesystem", null, ToolType.FILESYSTEM));
        notes = toolRepository.save(new Tool("notes", null, ToolType.FILESYSTEM));
        search = toolRepository.save(new Tool("search", null, ToolType.FILESYSTEM));
        docs = toolRepository.save(new Tool("docs", null, ToolType.FILESYSTEM));
        permissionRepository.save(new AgentToolPermission(agent, filesystem, Set.of(ActionType.READ, ActionType.WRITE,
                ActionType.DELETE), true));
        permissionRepository.save(new AgentToolPermission(agent, notes, Set.of(ActionType.READ), true));
        permissionRepository.save(new AgentToolPermission(agent, search, Set.of(ActionType.READ), true));
        permissionRepository.save(new AgentToolPermission(agent, docs, Set.of(ActionType.READ), true));

        when(riskEngineClient.assessRisk(any(), any(), any()))
                .thenReturn(new RiskAssessment(50, RiskTier.LOW, List.of(), "LOW risk", true));
    }

    @Test
    @DisplayName("Trajectory escalates ALLOW to REVIEW; the Risk Engine record and response tier are unchanged")
    void trajectoryEscalatesAllowToReviewAndKeepsRiskEngineRecord() throws Exception {
        String session = "s-escalate";
        seedEscalationHistory(session);

        ResultActions candidate = send(agentApiKey, "traj-agent", session, "filesystem", "READ", "src/Main.java")
                .andExpect(jsonPath("$.decision").value("REVIEW"))
                .andExpect(jsonPath("$.authorizationResult").value("AUTHORIZED"))
                .andExpect(jsonPath("$.riskScore").value(10))
                .andExpect(jsonPath("$.riskTier").value("LOW"))
                .andExpect(jsonPath("$.reason").value(org.hamcrest.Matchers.containsString(
                        "Escalated to REVIEW by trajectory analysis (score 60, HIGH)")))
                .andExpect(jsonPath("$.reviewRequestId").isNotEmpty());
        UUID requestId = requestIdOf(candidate);

        AuditLog audit = auditRepository.findByRequestId(requestId).orElseThrow();
        assertEquals(DecisionType.REVIEW, audit.getDecision());
        assertEquals(10, audit.getRiskScore());

        RiskAssessmentRecord riskRecord = riskRecordFor(requestId);
        assertEquals(50, riskRecord.getRiskScore());
        assertEquals(RiskTier.LOW, riskRecord.getRiskTier());
        assertEquals("[]", riskRecord.getFactors());

        ReviewRequest review = reviewRequestRepository.findByRequestId(requestId).orElseThrow();
        assertEquals(ReviewStatus.PENDING, review.getStatus());
        assertEquals(DecisionType.ALLOW, review.getOriginalDecision());
        assertEquals(60, review.getRiskScore());
        assertEquals(RiskTier.HIGH, review.getRiskTier());
        assertEquals(60, review.getTrajectoryScore());
        assertEquals(RiskTier.HIGH, review.getTrajectoryTier());
        assertTrue(review.getTrajectoryReason().contains("denied"));
        assertTrue(review.getTrajectoryReason().contains("distinct tools"));
        assertTrue(review.getTrajectoryReason().contains("within the last 60 seconds"));
    }

    @Test
    @DisplayName("Moderate history (MEDIUM, 45) keeps ALLOW and creates no review request")
    void moderateHistoryStaysAllow() throws Exception {
        String session = "s-moderate";
        send(agentApiKey, "traj-agent", session, "filesystem", "READ", ".env").andExpect(jsonPath("$.decision").value("DENY"));
        send(agentApiKey, "traj-agent", session, "notes", "READ", "secrets.txt").andExpect(jsonPath("$.decision").value("DENY"));
        send(agentApiKey, "traj-agent", session, "search", "READ", "keys.pem").andExpect(jsonPath("$.decision").value("DENY"));

        // Prior: 3 denials (30) + 4 tools (15) = 45 MEDIUM. Stays ALLOW.
        send(agentApiKey, "traj-agent", session, "docs", "READ", "docs/guide.md")
                .andExpect(jsonPath("$.decision").value("ALLOW"))
                .andExpect(jsonPath("$.reviewRequestId").doesNotExist());

        assertEquals(0, reviewRequestRepository.findAll().size());
    }

    @Test
    @DisplayName("Session isolation: the same agent in a fresh session gets no trajectory escalation")
    void freshSessionIsNotEscalated() throws Exception {
        seedEscalationHistory("s-isolated-source");

        send(agentApiKey, "traj-agent", "s-fresh", "filesystem", "READ", "src/Main.java")
                .andExpect(jsonPath("$.decision").value("ALLOW"))
                .andExpect(jsonPath("$.reviewRequestId").doesNotExist());
    }

    @Test
    @DisplayName("Agent isolation: another verified agent in the same session has its own empty history")
    void otherAgentInSameSessionIsNotEscalated() throws Exception {
        String session = "s-shared";
        seedEscalationHistory(session);

        AgentCreateResponse other = agentService.registerAgent(new AgentCreateRequest("other-agent", null));
        Agent otherAgent = agentRepository.findById(other.id()).orElseThrow();
        permissionRepository.save(new AgentToolPermission(otherAgent, filesystem, Set.of(ActionType.READ), true));

        send(other.apiKey(), "other-agent", session, "filesystem", "READ", "src/Main.java")
                .andExpect(jsonPath("$.decision").value("ALLOW"))
                .andExpect(jsonPath("$.reviewRequestId").doesNotExist());
    }

    @Test
    @DisplayName("Trajectory cannot produce DENY: a policy DENY in an escalated session stays DENY and is not evaluated")
    void trajectoryDoesNotCreateDeny() throws Exception {
        String session = "s-deny";
        seedEscalationHistory(session);

        send(agentApiKey, "traj-agent", session, "filesystem", "READ", ".env")
                .andExpect(jsonPath("$.decision").value("DENY"))
                .andExpect(jsonPath("$.riskScore").value(90))
                .andExpect(jsonPath("$.reviewRequestId").doesNotExist());
    }

    @Test
    @DisplayName("Trajectory cannot downgrade REVIEW: a REVIEW candidate in a heavy session stays REVIEW, and the review tier is effective")
    void trajectoryDoesNotDowngradeReview() throws Exception {
        String session = "s-review";
        seedEscalationHistory(session);

        ResultActions candidate = send(agentApiKey, "traj-agent", session, "filesystem", "DELETE", "dev/temp-file.log")
                .andExpect(jsonPath("$.decision").value("REVIEW"))
                .andExpect(jsonPath("$.reviewRequestId").isNotEmpty());
        UUID requestId = requestIdOf(candidate);

        ReviewRequest review = reviewRequestRepository.findByRequestId(requestId).orElseThrow();
        assertEquals(DecisionType.REVIEW, review.getOriginalDecision());
        assertEquals(RiskTier.CRITICAL, review.getRiskTier());
        assertEquals(80, review.getRiskScore());
        assertEquals(RiskTier.CRITICAL, review.getTrajectoryTier());
        assertEquals(80, review.getTrajectoryScore());
    }

    @Test
    @DisplayName("When the Risk Engine score is higher than trajectory's, the review keeps the Risk Engine score and tier")
    void reviewKeepsHigherRiskEngineScore() throws Exception {
        String session = "s-high-re";
        seedEscalationHistory(session); // seeded under the LOW stub so the history requests stay ALLOW

        // Risk Engine HIGH 70 escalates this ALLOW to REVIEW. Trajectory scores 60 HIGH, which is lower.
        when(riskEngineClient.assessRisk(any(), any(), any()))
                .thenReturn(new RiskAssessment(70, RiskTier.HIGH, List.of(), "HIGH risk", true));
        ResultActions candidate = send(agentApiKey, "traj-agent", session, "filesystem", "READ", "src/Main.java")
                .andExpect(jsonPath("$.decision").value("REVIEW"));
        UUID requestId = requestIdOf(candidate);

        ReviewRequest review = reviewRequestRepository.findByRequestId(requestId).orElseThrow();
        assertEquals(70, review.getRiskScore());
        assertEquals(RiskTier.HIGH, review.getRiskTier());
        assertEquals(60, review.getTrajectoryScore());
        assertEquals(RiskTier.HIGH, review.getTrajectoryTier());
    }

    /**
     * Five requests that build the history for the escalation candidate. Each stays in the same session and
     * within 60 seconds of the candidate.
     */
    private void seedEscalationHistory(String session) throws Exception {
        send(agentApiKey, "traj-agent", session, "filesystem", "READ", ".env").andExpect(jsonPath("$.decision").value("DENY"));
        send(agentApiKey, "traj-agent", session, "notes", "READ", "secrets.txt").andExpect(jsonPath("$.decision").value("DENY"));
        send(agentApiKey, "traj-agent", session, "search", "READ", "keys.pem").andExpect(jsonPath("$.decision").value("DENY"));
        send(agentApiKey, "traj-agent", session, "docs", "READ", "docs/guide.md").andExpect(jsonPath("$.decision").value("ALLOW"));
        send(agentApiKey, "traj-agent", session, "filesystem", "READ", "src/notes.md").andExpect(jsonPath("$.decision").value("ALLOW"));
    }

    private ResultActions send(String apiKey, String agentId, String session, String tool, String action,
                               String resource) throws Exception {
        return mockMvc.perform(post("/api/v1/gateway/evaluate")
                        .header(AgentApiKeyAuthenticationFilter.HEADER, apiKey)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("agentId", agentId, "sessionId", session,
                                "tool", tool, "action", action, "resource", resource))))
                .andExpect(status().isOk());
    }

    private UUID requestIdOf(ResultActions result) throws Exception {
        UUID requestId = UUID.fromString(objectMapper.readTree(result.andReturn().getResponse().getContentAsString())
                .get("requestId").asText());
        assertNotNull(requestId);
        return requestId;
    }

    private RiskAssessmentRecord riskRecordFor(UUID requestId) {
        return riskAssessmentRepository.findAll().stream()
                .filter(r -> requestId.equals(r.getRequestId()))
                .findFirst()
                .orElseThrow();
    }
}
