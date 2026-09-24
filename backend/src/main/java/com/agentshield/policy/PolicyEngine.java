package com.agentshield.policy;

import com.agentshield.dto.EvaluationRequest;
import com.agentshield.model.ActionType;
import com.agentshield.model.DecisionType;
import com.agentshield.model.ResourceSensitivity;
import org.springframework.stereotype.Component;

import java.util.Locale;

/**
 * Deterministic runtime policy engine for AgentShield (Phase 1 Baseline).
 *
 * Enforces zero-trust boundary evaluation on AI agent tool requests:
 * 1. Secret & Credential access -> DENY (Risk: 90, CRITICAL)
 * 2. Production DELETE operations -> DENY (Risk: 95, CRITICAL)
 * 3. Non-production DELETE operations -> REVIEW (Risk: 60, SENSITIVE)
 * 4. Admin / Protected EXECUTE operations -> REVIEW (Risk: 75, SENSITIVE)
 * 5. Outbound EXTERNAL_REQUEST operations -> REVIEW / DENY depending on resource sensitivity
 * 6. Standard READ / WRITE operations -> ALLOW (Risk: 10 / 20, INTERNAL / PUBLIC)
 *
 * NOTE: This is a deterministic Phase-1 baseline rule engine. It will be extended
 * in Phase 6 with ML-based anomaly detection and trajectory session scoring.
 */
@Component
public class PolicyEngine {

    public PolicyEvaluationResult evaluate(EvaluationRequest request) {
        String resource = request.getResource() != null ? request.getResource().toLowerCase(Locale.ROOT) : "";
        ActionType action = request.getAction();

        // Rule 2: Secret / Credential resource access -> DENY
        if (isSecretResource(resource)) {
            return PolicyEvaluationResult.builder()
                    .decision(DecisionType.DENY)
                    .reason("Access to credential or secret resource is denied by policy.")
                    .riskScore(90)
                    .resourceSensitivity(ResourceSensitivity.CRITICAL)
                    .build();
        }

        // Rule 3: DELETE on production resource -> DENY
        if (action == ActionType.DELETE && isProductionResource(resource)) {
            return PolicyEvaluationResult.builder()
                    .decision(DecisionType.DENY)
                    .reason("Destructive DELETE action on production resource is denied by policy.")
                    .riskScore(95)
                    .resourceSensitivity(ResourceSensitivity.CRITICAL)
                    .build();
        }

        // Rule 4: DELETE on non-production resource -> REVIEW
        if (action == ActionType.DELETE) {
            return PolicyEvaluationResult.builder()
                    .decision(DecisionType.REVIEW)
                    .reason("DELETE action on non-production resource requires human review.")
                    .riskScore(60)
                    .resourceSensitivity(ResourceSensitivity.SENSITIVE)
                    .build();
        }

        // Rule 5: EXECUTE on admin or protected resource -> REVIEW
        if (action == ActionType.EXECUTE && isAdminOrProtectedResource(resource)) {
            return PolicyEvaluationResult.builder()
                    .decision(DecisionType.REVIEW)
                    .reason("EXECUTE action on administrative or protected resource requires human review.")
                    .riskScore(75)
                    .resourceSensitivity(ResourceSensitivity.SENSITIVE)
                    .build();
        }

        // Generic EXECUTE action -> REVIEW
        if (action == ActionType.EXECUTE) {
            return PolicyEvaluationResult.builder()
                    .decision(DecisionType.REVIEW)
                    .reason("Execution action requires human review before proceeding.")
                    .riskScore(60)
                    .resourceSensitivity(ResourceSensitivity.SENSITIVE)
                    .build();
        }

        // Rule 6: EXTERNAL_REQUEST handling
        if (action == ActionType.EXTERNAL_REQUEST) {
            if (isProductionResource(resource) || isAdminOrProtectedResource(resource)) {
                return PolicyEvaluationResult.builder()
                        .decision(DecisionType.REVIEW)
                        .reason("Outbound external request involving sensitive resource requires human review.")
                        .riskScore(75)
                        .resourceSensitivity(ResourceSensitivity.SENSITIVE)
                        .build();
            }
            return PolicyEvaluationResult.builder()
                    .decision(DecisionType.REVIEW)
                    .reason("Outbound external API call requires human review.")
                    .riskScore(60)
                    .resourceSensitivity(ResourceSensitivity.SENSITIVE)
                    .build();
        }

        // Rule 1: Normal READ / WRITE operations on project resources -> ALLOW
        if (action == ActionType.READ) {
            ResourceSensitivity sensitivity = isPublicResource(resource) ? ResourceSensitivity.PUBLIC : ResourceSensitivity.INTERNAL;
            return PolicyEvaluationResult.builder()
                    .decision(DecisionType.ALLOW)
                    .reason("Action is within permitted policy bounds.")
                    .riskScore(10)
                    .resourceSensitivity(sensitivity)
                    .build();
        }

        if (action == ActionType.WRITE) {
            ResourceSensitivity sensitivity = isPublicResource(resource) ? ResourceSensitivity.PUBLIC : ResourceSensitivity.INTERNAL;
            return PolicyEvaluationResult.builder()
                    .decision(DecisionType.ALLOW)
                    .reason("Action is within permitted policy bounds.")
                    .riskScore(20)
                    .resourceSensitivity(sensitivity)
                    .build();
        }

        // Fallback default deny (Zero-trust principle)
        return PolicyEvaluationResult.builder()
                .decision(DecisionType.DENY)
                .reason("Action not explicitly permitted by security policy.")
                .riskScore(85)
                .resourceSensitivity(ResourceSensitivity.SENSITIVE)
                .build();
    }

    private boolean isSecretResource(String path) {
        if (path.endsWith(".env") || path.contains(".env.") || path.endsWith(".pem") || path.endsWith(".key")) {
            return true;
        }
        return path.contains("secret") || path.contains("secrets") ||
               path.contains("credential") || path.contains("credentials") ||
               path.contains("password") || path.contains("private-key");
    }

    private boolean isProductionResource(String path) {
        return path.contains("prod") || path.contains("production");
    }

    private boolean isAdminOrProtectedResource(String path) {
        return path.contains("admin") || path.contains("protected");
    }

    private boolean isPublicResource(String path) {
        return path.startsWith("public") || path.contains("readme") || path.contains("docs");
    }
}
