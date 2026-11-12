package com.agentshield.gateway;

import com.agentshield.config.MutableClock;
import com.agentshield.config.MutableClockConfig;
import com.agentshield.security.AdminApiKeyAuthenticationFilter;
import com.agentshield.security.AgentApiKeyAuthenticationFilter;
import com.fasterxml.jackson.databind.JsonNode;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.ResultActions;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Raw sensitive values never leave the request: not into the audit table, the review table, any API response
 * (evaluate, redeem, inspect, audit read, review read, error bodies) or the application log. Every path that sees
 * the values is exercised, then everything is searched for each raw value.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Import(MutableClockConfig.class)
@ExtendWith(OutputCaptureExtension.class)
class InspectionNoLeakTest extends AbstractTrajectoryGatewayTest {

    private static final String AWS_KEY = "AKIA" + "Z7NOLEAKTEST0001";
    private static final String PASSWORD = "Qz8#nL4$" + "wR6!tY2@";
    private static final String EMAIL = "carol.noleak" + "@" + "example.org";
    private static final String CARD = "5555 5555 5555 4444";
    private static final String CARD_DIGITS = "5555555555554444";
    private static final String PAN = "QWEPZ9876K";
    private static final String ARG_MARKER = "only-in-arguments-7f3a";
    private static final List<String> RAW = List.of(AWS_KEY, PASSWORD, EMAIL, CARD, CARD_DIGITS, PAN, ARG_MARKER);

    @Autowired
    private MutableClock clock;

    @Autowired
    private JdbcTemplate jdbc;

    @Value("${agentshield.security.admin-api-key}")
    private String adminApiKey;

    @Test
    @DisplayName("No raw value reaches the database, any response or the log")
    void rawValuesNeverLeak(CapturedOutput output) throws Exception {
        clock.set(Instant.now());
        List<String> bodies = new ArrayList<>();

        // DENY: a secret, a password flag and the marker.
        ResultActions deny = evaluate(List.of("deploy", "--password", PASSWORD, "key=" + AWS_KEY, ARG_MARKER));
        bodies.add(body(deny.andExpect(status().isOk())));
        UUID denyId = UUID.fromString(json(bodies.get(0)).get("requestId").asText());

        // REVIEW: PII only.
        Map<String, Object> pii = new LinkedHashMap<>();
        pii.put("to", EMAIL);
        pii.put("card", CARD);
        pii.put("pan", PAN);
        pii.put("note", ARG_MARKER);
        String reviewBody = body(evaluate(pii).andExpect(status().isOk()));
        bodies.add(reviewBody);
        JsonNode review = json(reviewBody);
        UUID reviewRequestId = UUID.fromString(review.get("requestId").asText());
        UUID reviewId = UUID.fromString(review.get("reviewRequestId").asText());

        // CLEAN ALLOW with the marker, then a mismatching and a matching redeem.
        String allowBody = body(evaluate(List.of("build", ARG_MARKER)).andExpect(status().isOk()));
        bodies.add(allowBody);
        String token = json(allowBody).get("decisionToken").asText();
        bodies.add(body(redeem(token, List.of("build", EMAIL)).andExpect(status().isForbidden())));
        bodies.add(body(redeem(token, List.of("build", ARG_MARKER)).andExpect(status().isOk())));

        // 400s carrying the values.
        bodies.add(body(evaluate(List.of(PASSWORD + "x".repeat(70_000))).andExpect(status().isBadRequest())));
        bodies.add(body(evaluate(17).andExpect(status().isBadRequest())));
        bodies.add(body(mockMvc.perform(post("/api/v1/gateway/evaluate")
                .header(AgentApiKeyAuthenticationFilter.HEADER, agentApiKey)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"arguments\": [\"" + AWS_KEY + "\"], \"broken\": ")).andExpect(status().isBadRequest())));

        // Output inspection.
        bodies.add(body(mockMvc.perform(post("/api/v1/gateway/inspect")
                .header(AgentApiKeyAuthenticationFilter.HEADER, agentApiKey)
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(Map.of("sessionId", "noleak", "tool", "filesystem",
                        "content", "out: " + AWS_KEY + " " + EMAIL + " " + PAN))))
                .andExpect(status().isOk())));

        // Admin read APIs.
        bodies.add(body(admin(get("/api/v1/audit/{id}", denyId))));
        bodies.add(body(admin(get("/api/v1/audit/{id}", reviewRequestId))));
        bodies.add(body(admin(get("/api/v1/audit"))));
        bodies.add(body(admin(get("/api/v1/reviews/{id}", reviewId))));
        bodies.add(body(admin(get("/api/v1/reviews").param("status", "PENDING"))));

        String database = dump("audit_logs") + dump("review_requests") + dump("risk_assessments")
                + dump("decision_redemptions");
        String log = output.getAll();

        // The test exercised what it claims to: findings were recorded.
        assertTrue(database.contains("AWS_ACCESS_KEY") && database.contains("EMAIL"), "findings are stored");
        assertTrue(String.join("\n", bodies).contains("[REDACTED:AWS_ACCESS_KEY]"), "inspect redacted the output");

        for (String raw : RAW) {
            for (int i = 0; i < bodies.size(); i++) {
                assertFalse(bodies.get(i).contains(raw), "response #" + i + " contains a raw value");
            }
            assertFalse(database.contains(raw), "the database contains a raw value");
            assertFalse(log.contains(raw), "the log contains a raw value");
        }
    }

    private ResultActions evaluate(Object arguments) throws Exception {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("agentId", AGENT_ID);
        body.put("sessionId", "noleak-" + UUID.randomUUID());
        body.put("tool", "filesystem");
        body.put("action", "WRITE");
        body.put("resource", "out/report.txt");
        body.put("arguments", arguments);
        return mockMvc.perform(post("/api/v1/gateway/evaluate")
                .header(AgentApiKeyAuthenticationFilter.HEADER, agentApiKey)
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(body)));
    }

    private ResultActions redeem(String token, Object arguments) throws Exception {
        return mockMvc.perform(post("/api/v1/gateway/decisions/redeem")
                .header(AgentApiKeyAuthenticationFilter.HEADER, agentApiKey)
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(Map.of("token", token, "tool", "filesystem", "action", "WRITE",
                        "resource", "out/report.txt", "arguments", arguments))));
    }

    private ResultActions admin(org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder request)
            throws Exception {
        return mockMvc.perform(request.header(AdminApiKeyAuthenticationFilter.HEADER, adminApiKey)).andExpect(status().isOk());
    }

    private static String body(ResultActions result) throws Exception {
        return result.andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8);
    }

    private JsonNode json(String body) throws Exception {
        return objectMapper.readTree(body);
    }

    /** Every column of every row, with binary (H2 JSON) values decoded as UTF-8 text. */
    private String dump(String table) {
        StringBuilder out = new StringBuilder();
        for (Map<String, Object> row : jdbc.queryForList("SELECT * FROM " + table)) {
            for (Object value : row.values()) {
                out.append(value instanceof byte[] bytes ? new String(bytes, StandardCharsets.UTF_8) : String.valueOf(value))
                        .append('|');
            }
            out.append('\n');
        }
        return out.toString();
    }
}
