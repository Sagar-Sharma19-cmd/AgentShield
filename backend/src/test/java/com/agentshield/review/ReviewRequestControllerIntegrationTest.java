package com.agentshield.review;

import com.agentshield.model.ActionType;
import com.agentshield.model.DecisionType;
import com.agentshield.model.ResourceSensitivity;
import com.agentshield.model.ReviewStatus;
import com.agentshield.model.RiskTier;
import com.agentshield.security.AdminApiKeyAuthenticationFilter;
import com.agentshield.security.AgentApiKeyAuthenticationFilter;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import java.time.Instant;
import java.util.UUID;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Phase 3 — Review API (category C): GET/list/start/approve/reject, 404 and invalid-
 * transition behavior, and reuse of the existing admin API key security convention.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class ReviewRequestControllerIntegrationTest {

    @Autowired
    private MockMvc mockMvc;

    @Value("${agentshield.security.admin-api-key}")
    private String adminApiKey;

    @Autowired
    private ReviewRequestRepository reviewRequestRepository;

    @BeforeEach
    void setUp() {
        reviewRequestRepository.deleteAll();
    }

    @Test
    @DisplayName("C. GET /reviews/{id} returns the review request")
    void testGetReview() throws Exception {
        ReviewRequest r = persistPending();

        mockMvc.perform(get("/api/v1/reviews/{id}", r.getId()).header(AdminApiKeyAuthenticationFilter.HEADER, adminApiKey))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(r.getId().toString()))
                .andExpect(jsonPath("$.requestId").value(r.getRequestId().toString()))
                .andExpect(jsonPath("$.status").value("PENDING"))
                .andExpect(jsonPath("$.riskTier").value("HIGH"));
    }

    @Test
    @DisplayName("C. GET /reviews/{id} -> 404 for an unknown id")
    void testGetReviewNotFound() throws Exception {
        mockMvc.perform(get("/api/v1/reviews/{id}", UUID.randomUUID()).header(AdminApiKeyAuthenticationFilter.HEADER, adminApiKey))
                .andExpect(status().isNotFound());
    }

    @Test
    @DisplayName("C. GET /reviews?status=PENDING lists only pending reviews")
    void testListPendingReviews() throws Exception {
        ReviewRequest pending = persistPending();
        ReviewRequest other = persistPending();
        reviewRequestRepository.save(setStatus(other, ReviewStatus.IN_REVIEW));

        mockMvc.perform(get("/api/v1/reviews").param("status", "PENDING").header(AdminApiKeyAuthenticationFilter.HEADER, adminApiKey))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].id").value(pending.getId().toString()));
    }

    @Test
    @DisplayName("C. POST /reviews/{id}/start -> PENDING to IN_REVIEW")
    void testStartReview() throws Exception {
        ReviewRequest r = persistPending();

        mockMvc.perform(post("/api/v1/reviews/{id}/start", r.getId()).header(AdminApiKeyAuthenticationFilter.HEADER, adminApiKey))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("IN_REVIEW"));
    }

    @Test
    @DisplayName("C. POST /reviews/{id}/approve -> IN_REVIEW to APPROVED")
    void testApproveReview() throws Exception {
        ReviewRequest r = reviewRequestRepository.save(setStatus(persistPending(), ReviewStatus.IN_REVIEW));

        mockMvc.perform(post("/api/v1/reviews/{id}/approve", r.getId()).header(AdminApiKeyAuthenticationFilter.HEADER, adminApiKey))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("APPROVED"))
                .andExpect(jsonPath("$.reviewedAt").isNotEmpty());
    }

    @Test
    @DisplayName("C. POST /reviews/{id}/reject -> IN_REVIEW to REJECTED")
    void testRejectReview() throws Exception {
        ReviewRequest r = reviewRequestRepository.save(setStatus(persistPending(), ReviewStatus.IN_REVIEW));

        mockMvc.perform(post("/api/v1/reviews/{id}/reject", r.getId()).header(AdminApiKeyAuthenticationFilter.HEADER, adminApiKey))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("REJECTED"))
                .andExpect(jsonPath("$.reviewedAt").isNotEmpty());
    }

    @Test
    @DisplayName("C. POST /reviews/{id}/approve on a PENDING (not yet IN_REVIEW) request -> 400")
    void testApproveWithoutStartIsInvalid() throws Exception {
        ReviewRequest r = persistPending();

        mockMvc.perform(post("/api/v1/reviews/{id}/approve", r.getId()).header(AdminApiKeyAuthenticationFilter.HEADER, adminApiKey))
                .andExpect(status().isBadRequest());
    }

    @Test
    @DisplayName("C. POST /reviews/{id}/start -> 404 for an unknown id")
    void testStartReviewNotFound() throws Exception {
        mockMvc.perform(post("/api/v1/reviews/{id}/start", UUID.randomUUID()).header(AdminApiKeyAuthenticationFilter.HEADER, adminApiKey))
                .andExpect(status().isNotFound());
    }

    @Test
    @DisplayName("Security: an agent API key is rejected on the admin-only review endpoints")
    void testAgentKeyRejectedOnReviewEndpoints() throws Exception {
        ReviewRequest r = persistPending();

        mockMvc.perform(get("/api/v1/reviews/{id}", r.getId()).header(AgentApiKeyAuthenticationFilter.HEADER, "agk_live_not-a-real-admin-key"))
                .andExpect(status().isUnauthorized());
    }

    private ReviewRequest persistPending() {
        Instant now = Instant.now();
        ReviewRequest reviewRequest = ReviewRequest.builder()
                .requestId(UUID.randomUUID())
                .agentId("research-agent")
                .sessionId("session-1")
                .tool("filesystem")
                .action(ActionType.DELETE)
                .resource("dev/temp-file.log")
                .resourceSensitivity(ResourceSensitivity.SENSITIVE)
                .riskScore(70)
                .riskTier(RiskTier.HIGH)
                .originalDecision(DecisionType.REVIEW)
                .status(ReviewStatus.PENDING)
                .reason("DELETE action on non-production resource requires human review.")
                .createdAt(now)
                .updatedAt(now)
                .build();
        return reviewRequestRepository.save(reviewRequest);
    }

    private ReviewRequest setStatus(ReviewRequest r, ReviewStatus status) {
        r.setStatus(status);
        r.setUpdatedAt(Instant.now());
        return r;
    }
}
