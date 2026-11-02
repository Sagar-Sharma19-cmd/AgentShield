package com.agentshield.review;

import com.agentshield.model.ActionType;
import com.agentshield.model.DecisionType;
import com.agentshield.model.ResourceSensitivity;
import com.agentshield.model.ReviewStatus;
import com.agentshield.model.RiskTier;
import com.agentshield.security.AdminApiKeyAuthenticationFilter;
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

import static org.hamcrest.Matchers.nullValue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Review API serialization of the trajectory fields (V8). Uses the real entity mapping and the real
 * ReviewRequestResponse DTO through the admin-only GET endpoints.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class ReviewTrajectoryApiTest {

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
    @DisplayName("GET /reviews/{id} serializes persisted trajectory score, tier and reason")
    void serializesTrajectoryFieldsWhenPresent() throws Exception {
        ReviewRequest r = persist(trajectoryReview(65, RiskTier.HIGH, "DENIAL_DENSITY: 2 recent denials"));

        mockMvc.perform(get("/api/v1/reviews/{id}", r.getId()).header(AdminApiKeyAuthenticationFilter.HEADER, adminApiKey))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.trajectoryScore").value(65))
                .andExpect(jsonPath("$.trajectoryTier").value("HIGH"))
                .andExpect(jsonPath("$.trajectoryReason").value("DENIAL_DENSITY: 2 recent denials"));
    }

    @Test
    @DisplayName("GET /reviews/{id} keeps every pre-existing review field unchanged alongside trajectory fields")
    void existingFieldsUnchangedWithTrajectory() throws Exception {
        ReviewRequest r = persist(trajectoryReview(60, RiskTier.HIGH, "BURST_RATE: 5 events in 60s"));

        mockMvc.perform(get("/api/v1/reviews/{id}", r.getId()).header(AdminApiKeyAuthenticationFilter.HEADER, adminApiKey))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(r.getId().toString()))
                .andExpect(jsonPath("$.requestId").value(r.getRequestId().toString()))
                .andExpect(jsonPath("$.agentId").value("research-agent"))
                .andExpect(jsonPath("$.sessionId").value("session-1"))
                .andExpect(jsonPath("$.tool").value("filesystem"))
                .andExpect(jsonPath("$.action").value("DELETE"))
                .andExpect(jsonPath("$.resource").value("dev/temp-file.log"))
                .andExpect(jsonPath("$.resourceSensitivity").value("SENSITIVE"))
                .andExpect(jsonPath("$.riskScore").value(70))
                .andExpect(jsonPath("$.riskTier").value("HIGH"))
                .andExpect(jsonPath("$.originalDecision").value("REVIEW"))
                .andExpect(jsonPath("$.status").value("PENDING"))
                .andExpect(jsonPath("$.reason").value("DELETE action on non-production resource requires human review."))
                .andExpect(jsonPath("$.createdAt").isNotEmpty())
                .andExpect(jsonPath("$.updatedAt").isNotEmpty())
                .andExpect(jsonPath("$.reviewedAt").value(nullValue()))
                .andExpect(jsonPath("$.trajectoryScore").value(60))
                .andExpect(jsonPath("$.trajectoryTier").value("HIGH"));
    }

    @Test
    @DisplayName("GET /reviews?status=PENDING serializes trajectory fields for each item")
    void listSerializesTrajectoryFields() throws Exception {
        ReviewRequest r = persist(trajectoryReview(85, RiskTier.CRITICAL, "SENSITIVE_READ_THEN_EGRESS: read then egress"));

        mockMvc.perform(get("/api/v1/reviews").param("status", "PENDING")
                        .header(AdminApiKeyAuthenticationFilter.HEADER, adminApiKey))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].id").value(r.getId().toString()))
                .andExpect(jsonPath("$[0].trajectoryScore").value(85))
                .andExpect(jsonPath("$[0].trajectoryTier").value("CRITICAL"))
                .andExpect(jsonPath("$[0].trajectoryReason").value("SENSITIVE_READ_THEN_EGRESS: read then egress"));
    }

    @Test
    @DisplayName("Null compatibility: a review without trajectory evaluation serializes trajectory fields as null")
    void nullTrajectoryFieldsSerializeAsNull() throws Exception {
        ReviewRequest r = persist(legacyReview());

        mockMvc.perform(get("/api/v1/reviews/{id}", r.getId()).header(AdminApiKeyAuthenticationFilter.HEADER, adminApiKey))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.trajectoryScore").value(nullValue()))
                .andExpect(jsonPath("$.trajectoryTier").value(nullValue()))
                .andExpect(jsonPath("$.trajectoryReason").value(nullValue()))
                .andExpect(jsonPath("$.riskScore").value(70))
                .andExpect(jsonPath("$.riskTier").value("HIGH"))
                .andExpect(jsonPath("$.status").value("PENDING"));
    }

    @Test
    @DisplayName("Null compatibility: the list endpoint serializes a mix of trajectory and legacy reviews")
    void listHandlesMixedNullAndPresentTrajectory() throws Exception {
        ReviewRequest legacy = persist(legacyReview());
        ReviewRequest traj = persist(trajectoryReview(60, RiskTier.HIGH, "TOOL_FAN_OUT: 4 distinct tools"));

        mockMvc.perform(get("/api/v1/reviews").param("status", "PENDING")
                        .header(AdminApiKeyAuthenticationFilter.HEADER, adminApiKey))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(2))
                .andExpect(jsonPath("$[?(@.id == '%s')].trajectoryScore", legacy.getId()).value(org.hamcrest.Matchers.hasItem(nullValue())))
                .andExpect(jsonPath("$[?(@.id == '%s')].trajectoryScore", traj.getId()).value(org.hamcrest.Matchers.hasItem(60)));
    }

    private ReviewRequest trajectoryReview(int trajectoryScore, RiskTier trajectoryTier, String trajectoryReason) {
        return base().trajectoryScore(trajectoryScore).trajectoryTier(trajectoryTier).trajectoryReason(trajectoryReason).build();
    }

    private ReviewRequest legacyReview() {
        return base().build();
    }

    private ReviewRequest.Builder base() {
        Instant now = Instant.now();
        return ReviewRequest.builder()
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
                .updatedAt(now);
    }

    private ReviewRequest persist(ReviewRequest reviewRequest) {
        return reviewRequestRepository.save(reviewRequest);
    }
}
