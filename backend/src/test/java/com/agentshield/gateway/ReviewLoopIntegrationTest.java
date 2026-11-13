package com.agentshield.gateway;

import com.agentshield.agent.Agent;
import com.agentshield.audit.AuditLog;
import com.agentshield.model.ActionOutcome;
import com.agentshield.model.DecisionType;
import com.agentshield.config.MutableClock;
import com.agentshield.config.MutableClockConfig;
import com.agentshield.dto.AgentCreateRequest;
import com.agentshield.dto.AgentCreateResponse;
import com.agentshield.exception.ConflictException;
import com.agentshield.model.ActionType;
import com.agentshield.review.ReviewRequest;
import com.agentshield.review.ReviewRequestService;
import com.agentshield.security.AdminApiKeyAuthenticationFilter;
import com.agentshield.security.AgentApiKeyAuthenticationFilter;
import com.agentshield.permission.AgentToolPermission;
import com.agentshield.tool.Tool;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.ResultActions;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Phase B3: the human review loop end to end. A REVIEW decision creates a review owned by the verified
 * agent; an operator approves or rejects it with a reviewer name and note; the owning agent reads it and
 * claims an approval exactly once. Time is controlled with {@link MutableClock}, never by sleeping.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Import(MutableClockConfig.class)
class ReviewLoopIntegrationTest extends AbstractTrajectoryGatewayTest {

    private static final String OTHER_AGENT = "other-agent";
    private static final String REVIEW_RESOURCE = "tmp/build-cache";

    @Autowired
    private MutableClock clock;

    @Autowired
    private ReviewRequestService reviewRequestService;

    @Value("${agentshield.security.admin-api-key}")
    private String adminApiKey;

    private String otherAgentKey;
    private UUID ownerAgentId;

    @BeforeEach
    void setUpLoop() {
        clock.set(Instant.now());
        AgentCreateResponse other = agentService.registerAgent(new AgentCreateRequest(OTHER_AGENT, null));
        otherAgentKey = other.apiKey();
        Agent otherAgent = agentRepository.findById(other.id()).orElseThrow();
        Tool filesystem = toolRepository.findByName("filesystem").orElseThrow();
        permissionRepository.save(new AgentToolPermission(otherAgent, filesystem, Set.of(ActionType.DELETE), true));
        ownerAgentId = agentRepository.findByName(AGENT_ID).orElseThrow().getId();
    }

    // ------------------------------------------------------------------ ownership and auth

    @Test
    @DisplayName("The review stores the verified agent id and its owner can read it")
    void ownerCanRead() throws Exception {
        UUID reviewId = createReview();

        ReviewRequest stored = reviewRequestRepository.findById(reviewId).orElseThrow();
        assertEquals(ownerAgentId, stored.getRegisteredAgentId());
        assertNotNull(stored.getExpiresAt());
        assertEquals(Duration.ofMinutes(30), Duration.between(stored.getCreatedAt(), stored.getExpiresAt()));

        agentGet(reviewId, agentApiKey)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(reviewId.toString()))
                .andExpect(jsonPath("$.status").value("PENDING"))
                .andExpect(jsonPath("$.tool").value("filesystem"))
                .andExpect(jsonPath("$.action").value("DELETE"))
                .andExpect(jsonPath("$.resource").value(REVIEW_RESOURCE))
                .andExpect(jsonPath("$.requestId").value(stored.getRequestId().toString()))
                .andExpect(jsonPath("$.expired").value(false))
                .andExpect(jsonPath("$.consumed").value(false))
                .andExpect(jsonPath("$.expiresAt").isNotEmpty())
                .andExpect(jsonPath("$.riskScore").doesNotExist());
    }

    @Test
    @DisplayName("Ownership uses the verified agent, not the claimed agentId in the request body")
    void ownershipIsTheVerifiedAgent() throws Exception {
        UUID reviewId = createReview();
        // The claimed agentId is stored for display only. Rewriting it does not move ownership.
        ReviewRequest stored = reviewRequestRepository.findById(reviewId).orElseThrow();
        stored.setAgentId(OTHER_AGENT);
        reviewRequestRepository.saveAndFlush(stored);

        agentGet(reviewId, otherAgentKey).andExpect(status().isNotFound());
        agentGet(reviewId, agentApiKey).andExpect(status().isOk());
    }

    @Test
    @DisplayName("Another agent gets 404 on read and claim, the same as an unknown id")
    void otherAgentGets404() throws Exception {
        UUID reviewId = createReview();
        approve(reviewId);

        agentGet(reviewId, otherAgentKey)
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.message").value("Review request not found."));
        claim(reviewId, otherAgentKey).andExpect(status().isNotFound());
        agentGet(UUID.randomUUID(), agentApiKey)
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.message").value("Review request not found."));

        // The other agent's attempt did not consume the approval.
        claim(reviewId, agentApiKey).andExpect(status().isOk());
    }

    @Test
    @DisplayName("Admin key, or no key, on the agent endpoints -> 401")
    void adminKeyRejectedOnAgentEndpoints() throws Exception {
        UUID reviewId = createReview();

        mockMvc.perform(get("/api/v1/gateway/reviews/{id}", reviewId).header(AdminApiKeyAuthenticationFilter.HEADER, adminApiKey))
                .andExpect(status().isUnauthorized());
        mockMvc.perform(get("/api/v1/gateway/reviews/{id}", reviewId).header(AgentApiKeyAuthenticationFilter.HEADER, adminApiKey))
                .andExpect(status().isUnauthorized());
        mockMvc.perform(post("/api/v1/gateway/reviews/{id}/claim", reviewId).header(AdminApiKeyAuthenticationFilter.HEADER, adminApiKey))
                .andExpect(status().isUnauthorized());
        mockMvc.perform(get("/api/v1/gateway/reviews/{id}", reviewId)).andExpect(status().isUnauthorized());
    }

    @Test
    @DisplayName("An agent key on the admin approve endpoint -> 401")
    void agentKeyRejectedOnAdminApprove() throws Exception {
        UUID reviewId = createReview();
        start(reviewId);

        mockMvc.perform(post("/api/v1/reviews/{id}/approve", reviewId)
                        .header(AgentApiKeyAuthenticationFilter.HEADER, agentApiKey)
                        .contentType(MediaType.APPLICATION_JSON).content("{\"reviewer\":\"mallory\"}"))
                .andExpect(status().isUnauthorized());
    }

    // ------------------------------------------------------------------ claim

    @Test
    @DisplayName("Approve then claim: returns the exact approved operation once; the second claim is 409")
    void claimWorksOnce() throws Exception {
        UUID reviewId = createReview();
        approve(reviewId);

        claim(reviewId, agentApiKey)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.reviewId").value(reviewId.toString()))
                .andExpect(jsonPath("$.tool").value("filesystem"))
                .andExpect(jsonPath("$.action").value("DELETE"))
                .andExpect(jsonPath("$.resource").value(REVIEW_RESOURCE))
                .andExpect(jsonPath("$.reviewer").value("alice"))
                .andExpect(jsonPath("$.consumedAt").isNotEmpty());

        claim(reviewId, agentApiKey)
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.message").value(org.hamcrest.Matchers.containsString("already claimed")));

        agentGet(reviewId, agentApiKey).andExpect(jsonPath("$.consumed").value(true));
        adminGet(reviewId).andExpect(jsonPath("$.consumedAt").isNotEmpty());

        // The successful claim left exactly one "approval claimed" audit row, linked to the original request;
        // the refused second claim left none. The original request still has exactly one row of its own.
        UUID originalRequestId = reviewRequestRepository.findById(reviewId).orElseThrow().getRequestId();
        List<AuditLog> claims = claimRows(originalRequestId);
        assertEquals(1, claims.size());
        AuditLog claimRow = claims.get(0);
        assertNotEquals(originalRequestId, claimRow.getRequestId());
        assertEquals(DecisionType.ALLOW, claimRow.getDecision());
        assertEquals(ActionOutcome.ALLOWED, claimRow.getActionOutcome());
        assertEquals("filesystem", claimRow.getTool());
        assertEquals(ActionType.DELETE, claimRow.getAction());
        assertEquals(REVIEW_RESOURCE, claimRow.getResource());
        assertEquals(ownerAgentId, claimRow.getRegisteredAgentId());
        assertEquals("Approved by alice; claimed once by the agent.", claimRow.getReason());
        assertEquals(DecisionType.REVIEW, auditRepository.findByRequestId(originalRequestId).orElseThrow().getDecision());

        mockMvc.perform(admin(get("/api/v1/audit/{requestId}", claimRow.getRequestId())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.claimedRequestId").value(originalRequestId.toString()))
                .andExpect(jsonPath("$.decision").value("ALLOW"));
    }

    private List<AuditLog> claimRows(UUID originalRequestId) {
        return auditRepository.findAll().stream()
                .filter(row -> originalRequestId.equals(row.getClaimedRequestId()))
                .toList();
    }

    @Test
    @DisplayName("Claim of a PENDING, IN_REVIEW or REJECTED review -> 409 and nothing is consumed")
    void claimRequiresApproval() throws Exception {
        UUID pending = createReview();
        claim(pending, agentApiKey)
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.message").value(org.hamcrest.Matchers.containsString("PENDING")));

        UUID inReview = createReview();
        start(inReview);
        claim(inReview, agentApiKey)
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.message").value(org.hamcrest.Matchers.containsString("IN_REVIEW")));

        UUID rejected = createReview();
        start(rejected);
        mockMvc.perform(admin(post("/api/v1/reviews/{id}/reject", rejected))
                        .content("{\"reviewer\":\"bob\",\"note\":\"Cache is shared with prod.\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("REJECTED"))
                .andExpect(jsonPath("$.reviewer").value("bob"))
                .andExpect(jsonPath("$.note").value("Cache is shared with prod."));
        claim(rejected, agentApiKey)
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.message").value(org.hamcrest.Matchers.containsString("REJECTED")));
        agentGet(rejected, agentApiKey)
                .andExpect(jsonPath("$.status").value("REJECTED"))
                .andExpect(jsonPath("$.reviewer").value("bob"))
                .andExpect(jsonPath("$.note").value("Cache is shared with prod."));

        for (UUID id : List.of(pending, inReview, rejected)) {
            ReviewRequest refused = reviewRequestRepository.findById(id).orElseThrow();
            assertEquals(null, refused.getConsumedAt());
            assertEquals(0, claimRows(refused.getRequestId()).size(), "a refused claim writes no audit row");
        }
    }

    @Test
    @DisplayName("Claim after expiry -> 409; read shows expired=true")
    void claimAfterExpiry() throws Exception {
        UUID reviewId = createReview();
        approve(reviewId);

        clock.advance(Duration.ofMinutes(31));

        claim(reviewId, agentApiKey)
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.message").value(org.hamcrest.Matchers.containsString("expired")));
        agentGet(reviewId, agentApiKey).andExpect(jsonPath("$.expired").value(true));
        adminGet(reviewId).andExpect(jsonPath("$.expired").value(true));
        assertEquals(null, reviewRequestRepository.findById(reviewId).orElseThrow().getConsumedAt());
    }

    @Test
    @DisplayName("Start, approve and reject on an expired review -> 409")
    void decisionsAfterExpiry() throws Exception {
        UUID pending = createReview();
        UUID inReview = createReview();
        start(inReview);

        // created_at comes from the gateway's wall clock, a few ms after the test clock was set, so step past it.
        clock.advance(Duration.ofMinutes(31));

        mockMvc.perform(admin(post("/api/v1/reviews/{id}/start", pending)))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.message").value(org.hamcrest.Matchers.containsString("expired")));
        mockMvc.perform(admin(post("/api/v1/reviews/{id}/approve", inReview)).content("{\"reviewer\":\"alice\"}"))
                .andExpect(status().isConflict());
        mockMvc.perform(admin(post("/api/v1/reviews/{id}/reject", inReview)).content("{\"reviewer\":\"alice\",\"note\":\"late\"}"))
                .andExpect(status().isConflict());
        assertEquals("IN_REVIEW", reviewRequestRepository.findById(inReview).orElseThrow().getStatus().name());
    }

    @Test
    @DisplayName("Concurrent double claim: exactly one succeeds, every other attempt is refused")
    void concurrentClaimHasOneWinner() throws Exception {
        ExecutorService pool = Executors.newFixedThreadPool(4);
        try {
            for (int round = 0; round < 10; round++) {
                UUID reviewId = createReview();
                approve(reviewId);
                CountDownLatch go = new CountDownLatch(1);
                List<Future<Boolean>> attempts = new ArrayList<>();
                for (int i = 0; i < 4; i++) {
                    Callable<Boolean> attempt = () -> {
                        go.await();
                        try {
                            reviewRequestService.claimForAgent(reviewId, ownerAgentId);
                            return true;
                        } catch (ConflictException refused) {
                            return false;
                        }
                    };
                    attempts.add(pool.submit(attempt));
                }
                go.countDown();
                int wins = 0;
                for (Future<Boolean> attempt : attempts) {
                    if (attempt.get(10, TimeUnit.SECONDS)) {
                        wins++;
                    }
                }
                assertEquals(1, wins, "round " + round + ": exactly one claim succeeds");
                ReviewRequest claimed = reviewRequestRepository.findById(reviewId).orElseThrow();
                assertNotNull(claimed.getConsumedAt());
                assertEquals(1, claimRows(claimed.getRequestId()).size(), "round " + round + ": one claim audit row");
            }
        } finally {
            pool.shutdownNow();
        }
    }

    // ------------------------------------------------------------------ admin bodies

    @Test
    @DisplayName("Approve stores reviewer and optional note; admin responses carry the new fields")
    void approveStoresReviewerAndNote() throws Exception {
        UUID reviewId = createReview();
        start(reviewId);

        mockMvc.perform(admin(post("/api/v1/reviews/{id}/approve", reviewId))
                        .content("{\"reviewer\":\"  alice  \",\"note\":\"Build cache only.\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("APPROVED"))
                .andExpect(jsonPath("$.reviewer").value("alice"))
                .andExpect(jsonPath("$.note").value("Build cache only."))
                .andExpect(jsonPath("$.expiresAt").isNotEmpty())
                .andExpect(jsonPath("$.expired").value(false))
                .andExpect(jsonPath("$.consumedAt").doesNotExist());
    }

    @Test
    @DisplayName("Approve without a reviewer (missing, blank, empty body or too long) -> 400; state unchanged")
    void approveRequiresReviewer() throws Exception {
        UUID reviewId = createReview();
        start(reviewId);

        for (String body : List.of("{}", "{\"reviewer\":\"   \"}", "{\"note\":\"ok\"}",
                "{\"reviewer\":\"" + "x".repeat(101) + "\"}")) {
            mockMvc.perform(admin(post("/api/v1/reviews/{id}/approve", reviewId)).content(body))
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.fieldErrors.reviewer").exists());
        }
        mockMvc.perform(post("/api/v1/reviews/{id}/approve", reviewId).header(AdminApiKeyAuthenticationFilter.HEADER, adminApiKey))
                .andExpect(status().isBadRequest());
        assertEquals("IN_REVIEW", reviewRequestRepository.findById(reviewId).orElseThrow().getStatus().name());
    }

    @Test
    @DisplayName("Reject without a note (missing, blank or too long) -> 400; state unchanged")
    void rejectRequiresNote() throws Exception {
        UUID reviewId = createReview();
        start(reviewId);

        for (String body : List.of("{\"reviewer\":\"bob\"}", "{\"reviewer\":\"bob\",\"note\":\"  \"}",
                "{\"reviewer\":\"bob\",\"note\":\"" + "n".repeat(1001) + "\"}")) {
            mockMvc.perform(admin(post("/api/v1/reviews/{id}/reject", reviewId)).content(body))
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.fieldErrors.note").exists());
        }
        assertEquals("IN_REVIEW", reviewRequestRepository.findById(reviewId).orElseThrow().getStatus().name());
    }

    // ------------------------------------------------------------------ helpers

    /** Non-production DELETE on a granted tool: PolicyEngine -> REVIEW, so a review request is created. */
    private UUID createReview() throws Exception {
        String body = send("loop-" + UUID.randomUUID(), "filesystem", "DELETE", REVIEW_RESOURCE)
                .andExpect(jsonPath("$.decision").value("REVIEW"))
                .andReturn().getResponse().getContentAsString();
        return UUID.fromString(objectMapper.readTree(body).get("reviewRequestId").asText());
    }

    private void start(UUID reviewId) throws Exception {
        mockMvc.perform(admin(post("/api/v1/reviews/{id}/start", reviewId))).andExpect(status().isOk());
    }

    private void approve(UUID reviewId) throws Exception {
        start(reviewId);
        mockMvc.perform(admin(post("/api/v1/reviews/{id}/approve", reviewId)).content("{\"reviewer\":\"alice\"}"))
                .andExpect(status().isOk());
    }

    private org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder admin(
            org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder request) {
        return request.header(AdminApiKeyAuthenticationFilter.HEADER, adminApiKey).contentType(MediaType.APPLICATION_JSON);
    }

    private ResultActions adminGet(UUID reviewId) throws Exception {
        return mockMvc.perform(get("/api/v1/reviews/{id}", reviewId).header(AdminApiKeyAuthenticationFilter.HEADER, adminApiKey));
    }

    private ResultActions agentGet(UUID reviewId, String key) throws Exception {
        return mockMvc.perform(get("/api/v1/gateway/reviews/{id}", reviewId).header(AgentApiKeyAuthenticationFilter.HEADER, key));
    }

    private ResultActions claim(UUID reviewId, String key) throws Exception {
        return mockMvc.perform(post("/api/v1/gateway/reviews/{id}/claim", reviewId).header(AgentApiKeyAuthenticationFilter.HEADER, key));
    }
}
