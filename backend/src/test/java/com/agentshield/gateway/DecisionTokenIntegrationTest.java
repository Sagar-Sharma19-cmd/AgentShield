package com.agentshield.gateway;

import com.agentshield.config.MutableClock;
import com.agentshield.config.MutableClockConfig;
import com.agentshield.dto.AgentCreateRequest;
import com.agentshield.dto.AgentCreateResponse;
import com.agentshield.dto.DecisionRedeemRequest;
import com.agentshield.agent.Agent;
import com.agentshield.enforcement.DecisionRedemptionService;
import com.agentshield.enforcement.DecisionRedemptionStore;
import com.agentshield.enforcement.DecisionTokenService;
import com.agentshield.exception.ConflictException;
import com.agentshield.model.ActionType;
import com.agentshield.model.AgentStatus;
import com.agentshield.permission.AgentToolPermission;
import com.agentshield.security.AdminApiKeyAuthenticationFilter;
import com.agentshield.security.AgentApiKeyAuthenticationFilter;
import com.agentshield.security.AuthenticatedAgent;
import com.agentshield.tool.Tool;
import com.fasterxml.jackson.databind.JsonNode;
import com.nimbusds.jwt.JWTClaimsSet;
import com.nimbusds.jwt.SignedJWT;
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
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

import static org.hamcrest.Matchers.containsString;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Phase E1: signed one-time decision tokens. A token is issued only on a final ALLOW and on a successful claim of
 * an approved review, and it can be redeemed exactly once, by its own agent, for exactly its operation, before it
 * expires. Time is controlled with {@link MutableClock}.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Import(MutableClockConfig.class)
class DecisionTokenIntegrationTest extends AbstractTrajectoryGatewayTest {

    private static final String ALLOW_RESOURCE = "src/notes.md";
    private static final String REVIEW_RESOURCE = "tmp/build-cache";

    @Autowired
    private MutableClock clock;

    @Autowired
    private DecisionTokenService tokenService;

    @Autowired
    private DecisionRedemptionService redemptionService;

    @Autowired
    private DecisionRedemptionStore redemptionStore;

    @Value("${agentshield.security.admin-api-key}")
    private String adminApiKey;

    private UUID ownerAgentId;
    private String otherAgentKey;

    @BeforeEach
    void setUpTokens() {
        clock.set(Instant.now());
        ownerAgentId = agentRepository.findByName(AGENT_ID).orElseThrow().getId();
        AgentCreateResponse other = agentService.registerAgent(new AgentCreateRequest("other-token-agent", null));
        otherAgentKey = other.apiKey();
        Agent otherAgent = agentRepository.findById(other.id()).orElseThrow();
        Tool filesystem = toolRepository.findByName("filesystem").orElseThrow();
        permissionRepository.save(new AgentToolPermission(otherAgent, filesystem, Set.of(ActionType.READ), true));
    }

    // ------------------------------------------------------------------ issuance

    @Test
    @DisplayName("ALLOW carries a token whose claims match the decision and the verified agent")
    void allowCarriesToken() throws Exception {
        JsonNode body = json(send(session(), "filesystem", "READ", ALLOW_RESOURCE)
                .andExpect(jsonPath("$.decision").value("ALLOW"))
                .andExpect(jsonPath("$.decisionToken").isString()));

        JWTClaimsSet claims = SignedJWT.parse(body.get("decisionToken").asText()).getJWTClaimsSet();
        assertEquals(body.get("requestId").asText(), claims.getJWTID());
        assertEquals(ownerAgentId.toString(), claims.getSubject());
        assertEquals("filesystem", claims.getStringClaim("tool"));
        assertEquals("READ", claims.getStringClaim("action"));
        assertEquals(DecisionTokenService.sha256Hex(ALLOW_RESOURCE), claims.getStringClaim("res"));
        assertEquals("ALLOW", claims.getStringClaim("src"));
        assertEquals(Duration.ofSeconds(60), Duration.between(claims.getIssueTime().toInstant(), claims.getExpirationTime().toInstant()));
    }

    @Test
    @DisplayName("DENY and REVIEW responses never carry a token (the field is absent)")
    void denyAndReviewHaveNoToken() throws Exception {
        send(session(), "filesystem", "READ", ".env")
                .andExpect(jsonPath("$.decision").value("DENY"))
                .andExpect(jsonPath("$.decisionToken").doesNotExist());
        send(session(), "filesystem", "DELETE", REVIEW_RESOURCE)
                .andExpect(jsonPath("$.decision").value("REVIEW"))
                .andExpect(jsonPath("$.decisionToken").doesNotExist());
        // Not granted at all: authorization DENY.
        send(session(), "notes", "WRITE", "x.md")
                .andExpect(jsonPath("$.decision").value("DENY"))
                .andExpect(jsonPath("$.decisionToken").doesNotExist());
    }

    @Test
    @DisplayName("A successful claim carries a REVIEW_APPROVED token for the approved operation; a failed claim carries none")
    void claimCarriesToken() throws Exception {
        JsonNode review = json(send(session(), "filesystem", "DELETE", REVIEW_RESOURCE));
        UUID reviewId = UUID.fromString(review.get("reviewRequestId").asText());

        claim(reviewId, agentApiKey).andExpect(status().isConflict()).andExpect(jsonPath("$.decisionToken").doesNotExist());

        approve(reviewId);
        JsonNode claimed = json(claim(reviewId, agentApiKey).andExpect(status().isOk()));
        JWTClaimsSet claims = SignedJWT.parse(claimed.get("decisionToken").asText()).getJWTClaimsSet();
        assertEquals(review.get("requestId").asText(), claims.getJWTID());
        assertEquals(ownerAgentId.toString(), claims.getSubject());
        assertEquals("filesystem", claims.getStringClaim("tool"));
        assertEquals("DELETE", claims.getStringClaim("action"));
        assertEquals(DecisionTokenService.sha256Hex(REVIEW_RESOURCE), claims.getStringClaim("res"));
        assertEquals("REVIEW_APPROVED", claims.getStringClaim("src"));

        // A second claim is refused and issues nothing.
        claim(reviewId, agentApiKey).andExpect(status().isConflict()).andExpect(jsonPath("$.decisionToken").doesNotExist());

        // The approved operation redeems once.
        redeem(agentApiKey, claimed.get("decisionToken").asText(), "filesystem", "DELETE", REVIEW_RESOURCE)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.requestId").value(review.get("requestId").asText()));
    }

    // ------------------------------------------------------------------ redeem

    @Test
    @DisplayName("Redeem succeeds once (200 with requestId and redeemedAt); a replay is 409")
    void redeemOnce() throws Exception {
        JsonNode allowed = json(send(session(), "filesystem", "READ", ALLOW_RESOURCE));
        String token = allowed.get("decisionToken").asText();

        redeem(agentApiKey, token, "filesystem", "READ", ALLOW_RESOURCE)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.requestId").value(allowed.get("requestId").asText()))
                .andExpect(jsonPath("$.redeemedAt").isNotEmpty())
                .andExpect(jsonPath("$.token").doesNotExist());
        assertTrue(redemptionStore.exists(UUID.fromString(allowed.get("requestId").asText())));

        redeem(agentApiKey, token, "filesystem", "READ", ALLOW_RESOURCE)
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.message").value(containsString("already redeemed")));
    }

    @Test
    @DisplayName("Concurrent double redeem: exactly one succeeds, every other attempt is 409")
    void concurrentRedeemHasOneWinner() throws Exception {
        ExecutorService pool = Executors.newFixedThreadPool(4);
        AuthenticatedAgent owner = new AuthenticatedAgent(ownerAgentId, AGENT_ID);
        try {
            for (int round = 0; round < 10; round++) {
                String token = json(send(session(), "filesystem", "READ", ALLOW_RESOURCE)).get("decisionToken").asText();
                DecisionRedeemRequest request = new DecisionRedeemRequest(token, "filesystem", ActionType.READ, ALLOW_RESOURCE);
                CountDownLatch go = new CountDownLatch(1);
                List<Future<Boolean>> attempts = new ArrayList<>();
                for (int i = 0; i < 4; i++) {
                    Callable<Boolean> attempt = () -> {
                        go.await();
                        try {
                            redemptionService.redeem(owner, request);
                            return true;
                        } catch (ConflictException replay) {
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
                assertEquals(1, wins, "round " + round + ": exactly one redemption succeeds");
            }
        } finally {
            pool.shutdownNow();
        }
    }

    @Test
    @DisplayName("An expired token is 401 and is not recorded")
    void expired() throws Exception {
        JsonNode allowed = json(send(session(), "filesystem", "READ", ALLOW_RESOURCE));
        clock.advance(Duration.ofSeconds(61));

        redeem(agentApiKey, allowed.get("decisionToken").asText(), "filesystem", "READ", ALLOW_RESOURCE)
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.message").value(containsString("expired")));
        assertFalse(redemptionStore.exists(UUID.fromString(allowed.get("requestId").asText())));
    }

    @Test
    @DisplayName("A tampered token is 401, and the error never echoes the token")
    void tampered() throws Exception {
        String token = json(send(session(), "filesystem", "READ", ALLOW_RESOURCE)).get("decisionToken").asText();
        String[] parts = token.split("\\.");
        char last = parts[2].charAt(parts[2].length() - 1);
        String badSignature = parts[0] + "." + parts[1] + "." + parts[2].substring(0, parts[2].length() - 1) + (last == 'A' ? 'B' : 'A');
        String badPayload = parts[0] + "." + parts[1].substring(1) + "." + parts[2];

        for (String bad : List.of(badSignature, badPayload, "garbage")) {
            String response = redeem(agentApiKey, bad, "filesystem", "READ", ALLOW_RESOURCE)
                    .andExpect(status().isUnauthorized())
                    .andReturn().getResponse().getContentAsString();
            assertFalse(response.contains(bad));
        }
        // The original is still redeemable: failed attempts consume nothing.
        redeem(agentApiKey, token, "filesystem", "READ", ALLOW_RESOURCE).andExpect(status().isOk());
    }

    @Test
    @DisplayName("Another agent's token is 403, and does not consume it")
    void otherAgent() throws Exception {
        String token = json(send(session(), "filesystem", "READ", ALLOW_RESOURCE)).get("decisionToken").asText();

        redeem(otherAgentKey, token, "filesystem", "READ", ALLOW_RESOURCE)
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.message").value(containsString("another agent")));
        redeem(agentApiKey, token, "filesystem", "READ", ALLOW_RESOURCE).andExpect(status().isOk());
    }

    @Test
    @DisplayName("A mismatched resource, tool or action is 403")
    void mismatchedOperation() throws Exception {
        String token = json(send(session(), "filesystem", "READ", ALLOW_RESOURCE)).get("decisionToken").asText();

        redeem(agentApiKey, token, "filesystem", "READ", "src/other.md").andExpect(status().isForbidden());
        redeem(agentApiKey, token, "filesystem", "READ", ALLOW_RESOURCE + " ").andExpect(status().isForbidden());
        redeem(agentApiKey, token, "notes", "READ", ALLOW_RESOURCE).andExpect(status().isForbidden());
        redeem(agentApiKey, token, "filesystem", "WRITE", ALLOW_RESOURCE)
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.message").value(containsString("different tool, action or resource")));
        redeem(agentApiKey, token, "filesystem", "READ", ALLOW_RESOURCE).andExpect(status().isOk());
    }

    @Test
    @DisplayName("A suspended agent cannot redeem a token issued before the suspension (403)")
    void suspendedAgent() throws Exception {
        String token = json(send(session(), "filesystem", "READ", ALLOW_RESOURCE)).get("decisionToken").asText();
        Agent owner = agentRepository.findById(ownerAgentId).orElseThrow();
        owner.setStatus(AgentStatus.SUSPENDED);
        agentRepository.saveAndFlush(owner);

        redeem(agentApiKey, token, "filesystem", "READ", ALLOW_RESOURCE)
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.message").value(containsString("not active")));
    }

    @Test
    @DisplayName("The admin key, or no key, on redeem is 401")
    void adminKeyRejected() throws Exception {
        String token = json(send(session(), "filesystem", "READ", ALLOW_RESOURCE)).get("decisionToken").asText();
        String body = objectMapper.writeValueAsString(Map.of("token", token, "tool", "filesystem", "action", "READ",
                "resource", ALLOW_RESOURCE));

        mockMvc.perform(post("/api/v1/gateway/decisions/redeem").header(AdminApiKeyAuthenticationFilter.HEADER, adminApiKey)
                        .contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isUnauthorized());
        mockMvc.perform(post("/api/v1/gateway/decisions/redeem").header(AgentApiKeyAuthenticationFilter.HEADER, adminApiKey)
                        .contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isUnauthorized());
        mockMvc.perform(post("/api/v1/gateway/decisions/redeem").contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isUnauthorized());
        // None of those consumed it.
        redeem(agentApiKey, token, "filesystem", "READ", ALLOW_RESOURCE).andExpect(status().isOk());
    }

    @Test
    @DisplayName("A malformed body is 400")
    void malformedBody() throws Exception {
        mockMvc.perform(post("/api/v1/gateway/decisions/redeem").header(AgentApiKeyAuthenticationFilter.HEADER, agentApiKey)
                        .contentType(MediaType.APPLICATION_JSON).content("{\"token\":\"\",\"tool\":\"filesystem\"}"))
                .andExpect(status().isBadRequest());
    }

    // ------------------------------------------------------------------ helpers

    private static String session() {
        return "token-" + UUID.randomUUID();
    }

    private JsonNode json(ResultActions result) throws Exception {
        return objectMapper.readTree(result.andReturn().getResponse().getContentAsString());
    }

    private ResultActions redeem(String key, String token, String tool, String action, String resource) throws Exception {
        return mockMvc.perform(post("/api/v1/gateway/decisions/redeem")
                .header(AgentApiKeyAuthenticationFilter.HEADER, key)
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(Map.of("token", token, "tool", tool, "action", action,
                        "resource", resource))));
    }

    private ResultActions claim(UUID reviewId, String key) throws Exception {
        return mockMvc.perform(post("/api/v1/gateway/reviews/{id}/claim", reviewId).header(AgentApiKeyAuthenticationFilter.HEADER, key));
    }

    private void approve(UUID reviewId) throws Exception {
        mockMvc.perform(post("/api/v1/reviews/{id}/start", reviewId).header(AdminApiKeyAuthenticationFilter.HEADER, adminApiKey))
                .andExpect(status().isOk());
        mockMvc.perform(post("/api/v1/reviews/{id}/approve", reviewId).header(AdminApiKeyAuthenticationFilter.HEADER, adminApiKey)
                        .contentType(MediaType.APPLICATION_JSON).content("{\"reviewer\":\"alice\"}"))
                .andExpect(status().isOk());
    }
}
