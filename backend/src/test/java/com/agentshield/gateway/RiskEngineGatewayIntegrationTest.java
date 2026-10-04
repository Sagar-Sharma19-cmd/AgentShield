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
import com.agentshield.model.ReviewStatus;
import com.agentshield.model.RiskTier;
import com.agentshield.model.ToolType;
import com.agentshield.permission.AgentToolPermission;
import com.agentshield.permission.AgentToolPermissionRepository;
import com.agentshield.review.ReviewRequestRepository;
import com.agentshield.riskengine.RiskAssessment;
import com.agentshield.riskengine.RiskAssessmentRecord;
import com.agentshield.riskengine.RiskAssessmentRepository;
import com.agentshield.riskengine.RiskEngineClient;
import com.agentshield.riskengine.RiskFactor;
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

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Phase 2 — Risk Engine gateway integration: escalation-only decision combination,
 * fail-safe behavior, and risk assessment persistence/audit correlation.
 *
 * RiskEngineClient is mocked at the service boundary (per the Phase 2 testing strategy):
 * these tests exercise GatewayService's orchestration deterministically, without a running
 * Python service. HTTP-level concerns (timeout enforcement, response parsing, fallback on
 * connection failure) are covered separately in HttpRiskEngineClientTest.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class RiskEngineGatewayIntegrationTest {

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
    private Tool tool;

    @BeforeEach
    void setUp() {
        reviewRequestRepository.deleteAll();
        riskAssessmentRepository.deleteAll();
        auditRepository.deleteAll();
        permissionRepository.deleteAll();
        agentRepository.deleteAll();
        toolRepository.deleteAll();

        AgentCreateResponse registered = agentService.registerAgent(new AgentCreateRequest("risk-test-agent", null));
        agentApiKey = registered.apiKey();
        agent = agentRepository.findById(registered.id()).orElseThrow();
        tool = toolRepository.save(new Tool("risk-test-tool", null, ToolType.FILESYSTEM));
    }

    // ------------------------------------------------------------------
    // A. Permission DENY — Risk Engine must not be called
    // ------------------------------------------------------------------

    @Test
    @DisplayName("A. Permission DENY -> final DENY, Risk Engine not called")
    void testPermissionDenyFinalDenyAndRiskEngineNotCalled() throws Exception {
        // No grant at all: PermissionEngine denies before PolicyEngine/RiskEngine ever run.
        when(riskEngineClient.assessRisk(any(), any(), any()))
                .thenReturn(new RiskAssessment(0, RiskTier.LOW, List.of(), "should never be used", true));

        evaluate("READ", "src/Main.java")
                .andExpect(jsonPath("$.decision").value("DENY"))
                .andExpect(jsonPath("$.authorizationResult").value("UNAUTHORIZED"));

        verifyNoInteractions(riskEngineClient);
    }

    // ------------------------------------------------------------------
    // B / J. Policy DENY — Risk Engine must not be called, and can never downgrade it
    // ------------------------------------------------------------------

    @Test
    @DisplayName("B/J. Policy DENY -> final DENY, Risk Engine not called (risk can never downgrade a DENY)")
    void testPolicyDenyFinalDenyAndRiskEngineNotCalled() throws Exception {
        grant(ActionType.READ);
        // Stubbed to a value that WOULD be favorable if (incorrectly) consulted.
        when(riskEngineClient.assessRisk(any(), any(), any()))
                .thenReturn(new RiskAssessment(0, RiskTier.LOW, List.of(), "should never be used", true));

        evaluate("READ", ".env")
                .andExpect(jsonPath("$.decision").value("DENY"))
                .andExpect(jsonPath("$.authorizationResult").value("AUTHORIZED"))
                .andExpect(jsonPath("$.riskScore").value(90));

        verify(riskEngineClient, never()).assessRisk(any(), any(), any());
    }

    // ------------------------------------------------------------------
    // C-F. Existing ALLOW + risk tier
    // ------------------------------------------------------------------

    @Test
    @DisplayName("C. ALLOW + LOW -> ALLOW")
    void testAllowLowStaysAllow() throws Exception {
        grant(ActionType.READ);
        stubRisk(RiskTier.LOW);

        evaluate("READ", "src/Main.java")
                .andExpect(jsonPath("$.decision").value("ALLOW"))
                .andExpect(jsonPath("$.riskScore").value(10))
                .andExpect(jsonPath("$.riskTier").value("LOW"));
    }

    @Test
    @DisplayName("D. ALLOW + MEDIUM -> ALLOW")
    void testAllowMediumStaysAllow() throws Exception {
        grant(ActionType.READ);
        stubRisk(RiskTier.MEDIUM);

        evaluate("READ", "src/Main.java")
                .andExpect(jsonPath("$.decision").value("ALLOW"))
                .andExpect(jsonPath("$.riskTier").value("MEDIUM"));
    }

    @Test
    @DisplayName("E. ALLOW + HIGH -> REVIEW")
    void testAllowHighEscalatesToReview() throws Exception {
        grant(ActionType.READ);
        stubRisk(RiskTier.HIGH);

        evaluate("READ", "src/Main.java")
                .andExpect(jsonPath("$.decision").value("REVIEW"))
                .andExpect(jsonPath("$.riskTier").value("HIGH"));
    }

    @Test
    @DisplayName("F. ALLOW + CRITICAL -> DENY")
    void testAllowCriticalEscalatesToDeny() throws Exception {
        grant(ActionType.READ);
        stubRisk(RiskTier.CRITICAL);

        evaluate("READ", "src/Main.java")
                .andExpect(jsonPath("$.decision").value("DENY"))
                .andExpect(jsonPath("$.riskTier").value("CRITICAL"));
    }

    // ------------------------------------------------------------------
    // G-I. Existing REVIEW + risk tier
    // ------------------------------------------------------------------

    @Test
    @DisplayName("G. REVIEW + LOW -> REVIEW")
    void testReviewLowStaysReview() throws Exception {
        grant(ActionType.DELETE);
        stubRisk(RiskTier.LOW);

        evaluate("DELETE", "dev/temp-file.log")
                .andExpect(jsonPath("$.decision").value("REVIEW"))
                .andExpect(jsonPath("$.riskScore").value(60));
    }

    @Test
    @DisplayName("G. REVIEW + MEDIUM -> REVIEW")
    void testReviewMediumStaysReview() throws Exception {
        grant(ActionType.DELETE);
        stubRisk(RiskTier.MEDIUM);

        evaluate("DELETE", "dev/temp-file.log")
                .andExpect(jsonPath("$.decision").value("REVIEW"));
    }

    @Test
    @DisplayName("H. REVIEW + HIGH -> REVIEW")
    void testReviewHighStaysReview() throws Exception {
        grant(ActionType.DELETE);
        stubRisk(RiskTier.HIGH);

        evaluate("DELETE", "dev/temp-file.log")
                .andExpect(jsonPath("$.decision").value("REVIEW"));
    }

    @Test
    @DisplayName("I. REVIEW + CRITICAL -> DENY")
    void testReviewCriticalEscalatesToDeny() throws Exception {
        grant(ActionType.DELETE);
        stubRisk(RiskTier.CRITICAL);

        evaluate("DELETE", "dev/temp-file.log")
                .andExpect(jsonPath("$.decision").value("DENY"));
    }

    // ------------------------------------------------------------------
    // K. Risk Engine unavailable -> approved fallback -> ALLOW escalates to REVIEW
    // ------------------------------------------------------------------

    @Test
    @DisplayName("K. Risk Engine unavailable -> fallback score=65/HIGH/unavailable, ALLOW escalates to REVIEW")
    void testRiskEngineUnavailableFallbackEscalatesAllowToReview() throws Exception {
        grant(ActionType.READ);
        when(riskEngineClient.assessRisk(any(), any(), any())).thenReturn(RiskAssessment.unavailable());

        evaluate("READ", "src/Main.java")
                .andExpect(jsonPath("$.decision").value("REVIEW"))
                .andExpect(jsonPath("$.riskTier").value("HIGH"))
                .andExpect(jsonPath("$.riskEngineAvailable").value(false));

        List<RiskAssessmentRecord> records = riskAssessmentRepository.findAll();
        assertEquals(1, records.size());
        assertEquals(65, records.get(0).getRiskScore());
        assertEquals(RiskTier.HIGH, records.get(0).getRiskTier());
        assertFalse(records.get(0).isEngineAvailable());
        assertEquals("risk_engine_unavailable", records.get(0).getReason());
    }

    // ------------------------------------------------------------------
    // N. Risk assessment persistence
    // ------------------------------------------------------------------

    @Test
    @DisplayName("N. Risk assessment is persisted with requestId, score, tier, factors, engine availability")
    void testRiskAssessmentPersisted() throws Exception {
        grant(ActionType.READ);
        when(riskEngineClient.assessRisk(any(), any(), any())).thenReturn(
                new RiskAssessment(42, RiskTier.MEDIUM,
                        List.of(new RiskFactor("ACTION_BASE_RISK", 5, "READ action carries a base risk of 5.")),
                        "MEDIUM risk", true));

        ResultActions result = evaluate("READ", "src/Main.java");
        String requestIdJson = objectMapper.readTree(result.andReturn().getResponse().getContentAsString())
                .get("requestId").asText();

        List<RiskAssessmentRecord> records = riskAssessmentRepository.findAll();
        assertEquals(1, records.size());
        RiskAssessmentRecord record = records.get(0);
        assertEquals(requestIdJson, record.getRequestId().toString());
        assertEquals(42, record.getRiskScore());
        assertEquals(RiskTier.MEDIUM, record.getRiskTier());
        assertEquals(true, record.isEngineAvailable());
        assertEquals("[{\"name\":\"ACTION_BASE_RISK\",\"score\":5,\"reason\":\"READ action carries a base risk of 5.\"}]",
                record.getFactors());
    }

    // ------------------------------------------------------------------
    // O. Audit correlation: audit requestId == risk_assessment requestId
    // ------------------------------------------------------------------

    @Test
    @DisplayName("O. Audit requestId correlates with the risk_assessment requestId for the same evaluation")
    void testAuditCorrelatesWithRiskAssessmentByRequestId() throws Exception {
        grant(ActionType.READ);
        stubRisk(RiskTier.LOW);

        evaluate("READ", "src/Main.java");

        List<AuditLog> auditLogs = auditRepository.findByAgentId("risk-test-agent");
        List<RiskAssessmentRecord> riskRecords = riskAssessmentRepository.findAll();

        assertEquals(1, auditLogs.size());
        assertEquals(1, riskRecords.size());
        assertEquals(auditLogs.get(0).getRequestId(), riskRecords.get(0).getRequestId());
    }

    // ------------------------------------------------------------------
    // D. Phase 3 — Human review workflow gateway integration
    // ------------------------------------------------------------------

    @Test
    @DisplayName("D. Final decision REVIEW (policy REVIEW, risk LOW) creates exactly one ReviewRequest")
    void testReviewDecisionCreatesExactlyOneReviewRequest() throws Exception {
        grant(ActionType.DELETE);
        stubRisk(RiskTier.LOW);

        ResultActions result = evaluate("DELETE", "dev/temp-file.log")
                .andExpect(jsonPath("$.decision").value("REVIEW"))
                .andExpect(jsonPath("$.reviewRequestId").isNotEmpty());

        String requestIdJson = objectMapper.readTree(result.andReturn().getResponse().getContentAsString())
                .get("requestId").asText();

        List<RiskAssessmentRecord> riskRecords = riskAssessmentRepository.findAll();
        assertEquals(1, riskRecords.size());
        var reviewRequests = reviewRequestRepository.findAll();
        assertEquals(1, reviewRequests.size());
        assertEquals(requestIdJson, reviewRequests.get(0).getRequestId().toString());
        assertEquals(ReviewStatus.PENDING, reviewRequests.get(0).getStatus());
        assertEquals(50, reviewRequests.get(0).getRiskScore());
        assertEquals(RiskTier.LOW, reviewRequests.get(0).getRiskTier());
        assertEquals(DecisionType.REVIEW, reviewRequests.get(0).getOriginalDecision());
    }

    @Test
    @DisplayName("D. ALLOW escalated to REVIEW by HIGH risk creates a ReviewRequest with originalDecision=ALLOW")
    void testAllowEscalatedToReviewCreatesReviewRequestWithOriginalAllow() throws Exception {
        grant(ActionType.READ);
        stubRisk(RiskTier.HIGH);

        evaluate("READ", "src/Main.java")
                .andExpect(jsonPath("$.decision").value("REVIEW"))
                .andExpect(jsonPath("$.reviewRequestId").isNotEmpty());

        var reviewRequests = reviewRequestRepository.findAll();
        assertEquals(1, reviewRequests.size());
        assertEquals(DecisionType.ALLOW, reviewRequests.get(0).getOriginalDecision());
        assertEquals(RiskTier.HIGH, reviewRequests.get(0).getRiskTier());
    }

    @Test
    @DisplayName("D. Final decision ALLOW never creates a ReviewRequest")
    void testAllowDoesNotCreateReviewRequest() throws Exception {
        grant(ActionType.READ);
        stubRisk(RiskTier.LOW);

        evaluate("READ", "src/Main.java")
                .andExpect(jsonPath("$.decision").value("ALLOW"))
                .andExpect(jsonPath("$.reviewRequestId").doesNotExist());

        assertEquals(0, reviewRequestRepository.findAll().size());
    }

    @Test
    @DisplayName("D. Policy DENY never creates a ReviewRequest")
    void testPolicyDenyDoesNotCreateReviewRequest() throws Exception {
        grant(ActionType.READ);
        when(riskEngineClient.assessRisk(any(), any(), any()))
                .thenReturn(new RiskAssessment(0, RiskTier.LOW, List.of(), "should never be used", true));

        evaluate("READ", ".env")
                .andExpect(jsonPath("$.decision").value("DENY"))
                .andExpect(jsonPath("$.reviewRequestId").doesNotExist());

        assertEquals(0, reviewRequestRepository.findAll().size());
    }

    @Test
    @DisplayName("D. Permission DENY never creates a ReviewRequest")
    void testPermissionDenyDoesNotCreateReviewRequest() throws Exception {
        evaluate("READ", "src/Main.java")
                .andExpect(jsonPath("$.decision").value("DENY"))
                .andExpect(jsonPath("$.reviewRequestId").doesNotExist());

        assertEquals(0, reviewRequestRepository.findAll().size());
    }

    @Test
    @DisplayName("D. CRITICAL risk escalates ALLOW to DENY, not REVIEW, and never creates a ReviewRequest")
    void testCriticalEscalationToDenyDoesNotCreateReviewRequest() throws Exception {
        grant(ActionType.READ);
        stubRisk(RiskTier.CRITICAL);

        evaluate("READ", "src/Main.java")
                .andExpect(jsonPath("$.decision").value("DENY"))
                .andExpect(jsonPath("$.reviewRequestId").doesNotExist());

        assertEquals(0, reviewRequestRepository.findAll().size());
    }

    private void stubRisk(RiskTier tier) {
        when(riskEngineClient.assessRisk(any(), any(), any()))
                .thenReturn(new RiskAssessment(50, tier, List.of(), tier + " risk", true));
    }

    private void grant(ActionType... actions) {
        permissionRepository.save(new AgentToolPermission(agent, tool, Set.of(actions), true));
    }

    private ResultActions evaluate(String action, String resource) throws Exception {
        return mockMvc.perform(post("/api/v1/gateway/evaluate")
                        .header(AgentApiKeyAuthenticationFilter.HEADER, agentApiKey)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(payload(action, resource))))
                .andExpect(status().isOk());
    }

    private Map<String, Object> payload(String action, String resource) {
        return Map.of("agentId", "risk-test-agent", "sessionId", "session-1", "tool", "risk-test-tool",
                "action", action, "resource", resource);
    }
}
