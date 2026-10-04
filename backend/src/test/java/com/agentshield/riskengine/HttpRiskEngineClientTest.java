package com.agentshield.riskengine;

import com.agentshield.model.ActionType;
import com.agentshield.model.ResourceSensitivity;
import com.agentshield.model.RiskTier;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.net.ServerSocket;
import java.nio.charset.StandardCharsets;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.content;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withServerError;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

/**
 * Unit tests for HttpRiskEngineClient: response parsing (M), HTTP-error fallback, invalid/
 * unparsable response fallback, and fail-safe behavior under real connection failure and
 * real socket timeout (L) — no running Python service required.
 */
class HttpRiskEngineClientTest {

    private HttpServer server;

    @AfterEach
    void tearDown() {
        if (server != null) {
            server.stop(0);
        }
    }

    // ------------------------------------------------------------------
    // M. Risk response parsing
    // ------------------------------------------------------------------

    @Test
    @DisplayName("M. Parses risk_score, risk_tier, factors, reason from a valid response")
    void testParsesValidResponse() {
        RestClient.Builder builder = RestClient.builder();
        MockRestServiceServer mockServer = MockRestServiceServer.bindTo(builder).build();
        RestClient restClient = builder.build();
        HttpRiskEngineClient client = new HttpRiskEngineClient(restClient);

        String body = """
                {
                  "risk_score": 90,
                  "risk_tier": "CRITICAL",
                  "factors": [
                    {"name": "RESOURCE_SENSITIVITY", "score": 50, "reason": "Resource matches a sensitive-resource pattern."},
                    {"name": "ACTION_BASE_RISK", "score": 40, "reason": "DELETE action carries a base risk of 40."}
                  ],
                  "reason": "CRITICAL risk: multiple risk factors were detected."
                }
                """;

        mockServer.expect(requestTo("/score"))
                .andExpect(method(HttpMethod.POST))
                .andExpect(content().contentType(MediaType.APPLICATION_JSON))
                .andRespond(withSuccess(body, MediaType.APPLICATION_JSON));

        RiskAssessment result = client.assessRisk(ActionType.DELETE, "secrets/credentials.json", ResourceSensitivity.SENSITIVE);

        assertTrue(result.engineAvailable());
        assertEquals(90, result.riskScore());
        assertEquals(RiskTier.CRITICAL, result.riskTier());
        assertEquals("CRITICAL risk: multiple risk factors were detected.", result.reason());
        assertEquals(2, result.factors().size());
        assertEquals("RESOURCE_SENSITIVITY", result.factors().get(0).name());
        assertEquals(50, result.factors().get(0).score());
    }

    // ------------------------------------------------------------------
    // Fail-safe: HTTP error status
    // ------------------------------------------------------------------

    @Test
    @DisplayName("HTTP 500 from the Risk Engine falls back to unavailable(), never throws")
    void testHttpErrorFallsBackToUnavailable() {
        RestClient.Builder builder = RestClient.builder();
        MockRestServiceServer mockServer = MockRestServiceServer.bindTo(builder).build();
        RestClient restClient = builder.build();
        HttpRiskEngineClient client = new HttpRiskEngineClient(restClient);

        mockServer.expect(requestTo("/score")).andRespond(withServerError());

        RiskAssessment result = client.assessRisk(ActionType.READ, "src/Main.java", ResourceSensitivity.INTERNAL);

        assertFallbackAssessment(result);
    }

    // ------------------------------------------------------------------
    // Fail-safe: unparsable / invalid response
    // ------------------------------------------------------------------

    @Test
    @DisplayName("An unrecognized risk_tier value falls back to unavailable(), never throws")
    void testInvalidRiskTierFallsBackToUnavailable() {
        RestClient.Builder builder = RestClient.builder();
        MockRestServiceServer mockServer = MockRestServiceServer.bindTo(builder).build();
        RestClient restClient = builder.build();
        HttpRiskEngineClient client = new HttpRiskEngineClient(restClient);

        String body = """
                {"risk_score": 10, "risk_tier": "NOT_A_REAL_TIER", "factors": [], "reason": "x"}
                """;
        mockServer.expect(requestTo("/score")).andRespond(withSuccess(body, MediaType.APPLICATION_JSON));

        RiskAssessment result = client.assessRisk(ActionType.READ, "src/Main.java", ResourceSensitivity.INTERNAL);

        assertFallbackAssessment(result);
    }

    @Test
    @DisplayName("A response missing risk_tier falls back to unavailable(), never throws")
    void testMissingRiskTierFallsBackToUnavailable() {
        RestClient.Builder builder = RestClient.builder();
        MockRestServiceServer mockServer = MockRestServiceServer.bindTo(builder).build();
        RestClient restClient = builder.build();
        HttpRiskEngineClient client = new HttpRiskEngineClient(restClient);

        String body = """
                {"risk_score": 10, "factors": [], "reason": "x"}
                """;
        mockServer.expect(requestTo("/score")).andRespond(withSuccess(body, MediaType.APPLICATION_JSON));

        RiskAssessment result = client.assessRisk(ActionType.READ, "src/Main.java", ResourceSensitivity.INTERNAL);

        assertFallbackAssessment(result);
    }

    // ------------------------------------------------------------------
    // Fail-safe: real connection failure (K) and real socket timeout (L)
    // ------------------------------------------------------------------

    @Test
    @DisplayName("K. Connection refused (Risk Engine unreachable) falls back to unavailable()")
    void testConnectionRefusedFallsBackToUnavailable() throws IOException {
        int unusedPort = findFreePort();
        HttpRiskEngineClient client = new HttpRiskEngineClient("http://localhost:" + unusedPort, 200);

        RiskAssessment result = client.assessRisk(ActionType.READ, "src/Main.java", ResourceSensitivity.INTERNAL);

        assertFallbackAssessment(result);
    }

    @Test
    @DisplayName("L. A Risk Engine slower than the configured timeout falls back to unavailable() without hanging")
    void testSlowResponseTimesOutAndFallsBackToUnavailable() throws IOException {
        int timeoutMs = 100;
        long serverDelayMs = 2000;

        server = HttpServer.create(new InetSocketAddress("localhost", 0), 0);
        server.createContext("/score", exchange -> {
            try {
                Thread.sleep(serverDelayMs);
            } catch (InterruptedException ignored) {
                Thread.currentThread().interrupt();
            }
            byte[] body = "{\"risk_score\":5,\"risk_tier\":\"LOW\",\"factors\":[],\"reason\":\"late\"}"
                    .getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().add("Content-Type", "application/json");
            exchange.sendResponseHeaders(200, body.length);
            exchange.getResponseBody().write(body);
            exchange.close();
        });
        server.start();

        HttpRiskEngineClient client = new HttpRiskEngineClient("http://localhost:" + server.getAddress().getPort(), timeoutMs);

        long start = System.currentTimeMillis();
        RiskAssessment result = client.assessRisk(ActionType.READ, "src/Main.java", ResourceSensitivity.INTERNAL);
        long elapsedMs = System.currentTimeMillis() - start;

        assertFallbackAssessment(result);
        assertTrue(elapsedMs < serverDelayMs,
                "client must fail via its own timeout (" + timeoutMs + "ms) rather than wait for the " +
                        serverDelayMs + "ms server delay; elapsed=" + elapsedMs + "ms");
    }

    private void assertFallbackAssessment(RiskAssessment result) {
        assertFalse(result.engineAvailable());
        assertEquals(RiskAssessment.UNAVAILABLE_FALLBACK_SCORE, result.riskScore());
        assertEquals(RiskAssessment.UNAVAILABLE_FALLBACK_TIER, result.riskTier());
        assertEquals(RiskAssessment.UNAVAILABLE_REASON, result.reason());
    }

    private static int findFreePort() throws IOException {
        try (ServerSocket socket = new ServerSocket(0)) {
            return socket.getLocalPort();
        }
    }
}
