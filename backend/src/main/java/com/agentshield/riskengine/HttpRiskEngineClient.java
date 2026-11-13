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
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestClientResponseException;

import java.net.ConnectException;
import java.net.SocketTimeoutException;
import java.net.http.HttpTimeoutException;
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
 *
 * A timeout or connection error (see {@link #isNoResponse}) is retried up to {@code max-retries} times
 * (default 1) after a short pause. An HTTP error status or a response that cannot be interpreted is never
 * retried: the engine answered, so asking again would give the same answer. With the defaults (1000 ms, one
 * retry) a slow engine costs at most about 2 x 1000 ms + 100 ms before the gateway falls back.
 */
@Component
public class HttpRiskEngineClient implements RiskEngineClient {

    private static final Logger log = LoggerFactory.getLogger(HttpRiskEngineClient.class);

    /** Upper bound on {@code agentshield.risk-engine.max-retries}, so a misconfiguration cannot stall the gateway. */
    static final int MAX_RETRIES_LIMIT = 3;
    /** Pause before a retry, giving a briefly overloaded engine a moment. */
    static final Duration RETRY_BACKOFF = Duration.ofMillis(100);

    private final RestClient restClient;
    private final int maxRetries;
    private final Duration retryBackoff;

    @Autowired
    public HttpRiskEngineClient(@Value("${agentshield.risk-engine.url}") String baseUrl,
                                 @Value("${agentshield.risk-engine.timeout-ms:1000}") int timeoutMs,
                                 @Value("${agentshield.risk-engine.max-retries:1}") int maxRetries) {
        this(buildRestClient(baseUrl, timeoutMs), maxRetries, RETRY_BACKOFF);
    }

    /** Test-visible: one retry, as the default configuration. */
    HttpRiskEngineClient(String baseUrl, int timeoutMs) {
        this(baseUrl, timeoutMs, 1);
    }

    /** Test-visible constructor: inject a pre-built RestClient (e.g. bound to a mock server). */
    HttpRiskEngineClient(RestClient restClient) {
        this(restClient, 1, Duration.ZERO);
    }

    HttpRiskEngineClient(RestClient restClient, int maxRetries, Duration retryBackoff) {
        if (maxRetries < 0 || maxRetries > MAX_RETRIES_LIMIT) {
            throw new IllegalArgumentException(
                    "agentshield.risk-engine.max-retries must be between 0 and " + MAX_RETRIES_LIMIT + ".");
        }
        this.restClient = restClient;
        this.maxRetries = maxRetries;
        this.retryBackoff = retryBackoff;
    }

    private static RestClient buildRestClient(String baseUrl, int timeoutMs) {
        if (timeoutMs <= 0) {
            throw new IllegalArgumentException("agentshield.risk-engine.timeout-ms must be positive.");
        }
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
        for (int attempt = 0; ; attempt++) {
            try {
                RiskScoreApiResponse response = restClient.post()
                        .uri("/score")
                        .body(new RiskScoreRequestPayload(action, resource, resourceSensitivity))
                        .retrieve()
                        .body(RiskScoreApiResponse.class);

                return toRiskAssessment(response);
            } catch (RestClientException e) {
                if (isNoResponse(e)) {
                    // Timeout or connection failure: the engine did not answer. Retry, then fail safe.
                    if (attempt < maxRetries && pauseBeforeRetry()) {
                        log.info("Risk Engine did not respond ({}); retrying ({} of {}).",
                                rootCauseName(e), attempt + 1, maxRetries);
                        continue;
                    }
                    log.warn("Risk Engine did not respond ({}) after {} attempt(s); falling back to {} ({}).",
                            rootCauseName(e), attempt + 1, RiskAssessment.UNAVAILABLE_FALLBACK_TIER,
                            RiskAssessment.UNAVAILABLE_REASON);
                    return RiskAssessment.unavailable();
                }
                // HTTP error status or an unreadable body: the engine answered, so it is not retried.
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
    }

    /** Sleeps for the backoff. False when interrupted: the interrupt is kept and no retry is made. */
    private boolean pauseBeforeRetry() {
        if (retryBackoff.isZero()) {
            return true;
        }
        try {
            Thread.sleep(retryBackoff.toMillis());
            return true;
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            return false;
        }
    }

    /**
     * True for a timeout or a connection failure: the engine did not answer. A read timeout can surface as a
     * plain RestClientException (while the response is being read), so the cause chain is checked too. An HTTP
     * error status (RestClientResponseException) is an answer and is never treated as "no response".
     */
    static boolean isNoResponse(RestClientException e) {
        if (e instanceof RestClientResponseException) {
            return false;
        }
        if (e instanceof ResourceAccessException) {
            return true;
        }
        for (Throwable cause = e.getCause(); cause != null && cause != cause.getCause(); cause = cause.getCause()) {
            if (cause instanceof SocketTimeoutException || cause instanceof ConnectException
                    || cause instanceof HttpTimeoutException) {
                return true;
            }
        }
        return false;
    }

    private static String rootCauseName(Throwable e) {
        Throwable cause = e;
        while (cause.getCause() != null && cause.getCause() != cause) {
            cause = cause.getCause();
        }
        return cause.getClass().getSimpleName();
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
