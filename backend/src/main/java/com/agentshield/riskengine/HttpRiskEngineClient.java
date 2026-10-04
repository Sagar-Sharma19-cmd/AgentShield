package com.agentshield.riskengine;

import com.agentshield.model.ActionType;
import com.agentshield.model.ResourceSensitivity;
import com.agentshield.model.RiskTier;
import com.fasterxml.jackson.annotation.JsonProperty;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

import java.time.Duration;
import java.util.List;

/**
 * HTTP client for the standalone Python Risk Engine ({@code POST /score}).
 *
 * Fails safely (Rule 4 of the Phase 2 design): any timeout, connectivity failure, HTTP error
 * status, or response this client cannot parse into a valid {@link RiskAssessment} results in
 * {@link RiskAssessment#unavailable()} being returned — never an exception, and never a
 * silent "no risk" result. The configured timeout bounds both connection and read time, so a
 * slow or hanging Risk Engine cannot block the gateway indefinitely.
 */
@Component
public class HttpRiskEngineClient implements RiskEngineClient {

    private static final Logger log = LoggerFactory.getLogger(HttpRiskEngineClient.class);

    private final RestClient restClient;

    @Autowired
    public HttpRiskEngineClient(@Value("${agentshield.risk-engine.url}") String baseUrl,
                                 @Value("${agentshield.risk-engine.timeout-ms:300}") int timeoutMs) {
        this(buildRestClient(baseUrl, timeoutMs));
    }

    /** Test-visible constructor: inject a pre-built RestClient (e.g. bound to a mock server). */
    HttpRiskEngineClient(RestClient restClient) {
        this.restClient = restClient;
    }

    private static RestClient buildRestClient(String baseUrl, int timeoutMs) {
        SimpleClientHttpRequestFactory requestFactory = new SimpleClientHttpRequestFactory();
        requestFactory.setConnectTimeout(Duration.ofMillis(timeoutMs));
        requestFactory.setReadTimeout(Duration.ofMillis(timeoutMs));
        return RestClient.builder()
                .baseUrl(baseUrl)
                .requestFactory(requestFactory)
                .build();
    }

    @Override
    public RiskAssessment assessRisk(ActionType action, String resource, ResourceSensitivity resourceSensitivity) {
        try {
            RiskScoreApiResponse response = restClient.post()
                    .uri("/score")
                    .body(new RiskScoreRequestPayload(action, resource, resourceSensitivity))
                    .retrieve()
                    .body(RiskScoreApiResponse.class);

            return toRiskAssessment(response);
        } catch (RestClientException e) {
            log.warn("Risk Engine call failed ({}); falling back to {} ({}).",
                    e.getClass().getSimpleName(), RiskAssessment.UNAVAILABLE_FALLBACK_TIER, RiskAssessment.UNAVAILABLE_REASON);
            return RiskAssessment.unavailable();
        } catch (RuntimeException e) {
            // Covers malformed/unparsable responses (e.g. an unrecognized risk_tier value)
            // that are not themselves RestClientExceptions.
            log.warn("Risk Engine response could not be interpreted ({}); falling back to {} ({}).",
                    e.getClass().getSimpleName(), RiskAssessment.UNAVAILABLE_FALLBACK_TIER, RiskAssessment.UNAVAILABLE_REASON);
            return RiskAssessment.unavailable();
        }
    }

    private RiskAssessment toRiskAssessment(RiskScoreApiResponse response) {
        if (response == null || response.riskTier() == null) {
            log.warn("Risk Engine returned an empty/invalid response; falling back to {} ({}).",
                    RiskAssessment.UNAVAILABLE_FALLBACK_TIER, RiskAssessment.UNAVAILABLE_REASON);
            return RiskAssessment.unavailable();
        }

        RiskTier tier = RiskTier.valueOf(response.riskTier());
        List<RiskFactor> factors = response.factors() == null
                ? List.of()
                : response.factors().stream()
                        .map(f -> new RiskFactor(f.name(), f.score(), f.reason()))
                        .toList();

        return new RiskAssessment(response.riskScore(), tier, factors, response.reason(), true);
    }

    /** Outbound request body matching risk-engine/scoring.py's RiskAssessmentRequest. */
    private record RiskScoreRequestPayload(ActionType action, String resource,
                                            @JsonProperty("resource_sensitivity") ResourceSensitivity resourceSensitivity) {
    }

    /** Inbound response body matching risk-engine/scoring.py's RiskAssessmentResponse. */
    private record RiskScoreApiResponse(@JsonProperty("risk_score") int riskScore,
                                         @JsonProperty("risk_tier") String riskTier,
                                         List<RiskFactorPayload> factors,
                                         String reason) {
    }

    private record RiskFactorPayload(String name, int score, String reason) {
    }
}
