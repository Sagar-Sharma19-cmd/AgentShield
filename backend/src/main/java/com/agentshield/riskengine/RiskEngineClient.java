package com.agentshield.riskengine;

import com.agentshield.model.ActionType;
import com.agentshield.model.ResourceSensitivity;

/**
 * Client abstraction for the standalone Python Risk Engine's {@code POST /score} endpoint.
 *
 * Implementations must fail safely: a timeout, outage, HTTP error, or unparsable response
 * must never be allowed to throw out of {@link #assessRisk}. They must instead return
 * {@link RiskAssessment#unavailable()} so the gateway can apply its approved fallback.
 */
public interface RiskEngineClient {

    /**
     * @param action              the requested action
     * @param resource            the target resource identifier
     * @param resourceSensitivity the resource sensitivity already classified by PolicyEngine
     *                            (sent for API-vocabulary consistency only; the Risk Engine's
     *                            own RESOURCE_SENSITIVITY factor derives sensitivity itself
     *                            from {@code resource} and does not consume this field)
     */
    RiskAssessment assessRisk(ActionType action, String resource, ResourceSensitivity resourceSensitivity);
}
