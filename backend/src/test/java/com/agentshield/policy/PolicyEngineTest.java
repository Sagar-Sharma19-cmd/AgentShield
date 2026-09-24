package com.agentshield.policy;

import com.agentshield.dto.EvaluationRequest;
import com.agentshield.model.ActionType;
import com.agentshield.model.DecisionType;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;

class PolicyEngineTest {

    private PolicyEngine policyEngine;

    @BeforeEach
    void setUp() {
        policyEngine = new PolicyEngine();
    }

    @Test
    @DisplayName("1. Normal READ -> ALLOW")
    void testNormalReadAllowed() {
        EvaluationRequest request = EvaluationRequest.builder()
                .agentId("agent-1")
                .sessionId("session-1")
                .tool("file-reader")
                .action(ActionType.READ)
                .resource("src/main/App.java")
                .build();

        PolicyEvaluationResult result = policyEngine.evaluate(request);

        assertEquals(DecisionType.ALLOW, result.getDecision());
        assertEquals(10, result.getRiskScore());
    }

    @Test
    @DisplayName("2. Normal WRITE -> ALLOW")
    void testNormalWriteAllowed() {
        EvaluationRequest request = EvaluationRequest.builder()
                .agentId("agent-1")
                .sessionId("session-1")
                .tool("file-writer")
                .action(ActionType.WRITE)
                .resource("src/main/App.java")
                .build();

        PolicyEvaluationResult result = policyEngine.evaluate(request);

        assertEquals(DecisionType.ALLOW, result.getDecision());
        assertEquals(20, result.getRiskScore());
    }

    @Test
    @DisplayName("3. .env access -> DENY")
    void testDotEnvDenied() {
        EvaluationRequest request = EvaluationRequest.builder()
                .agentId("agent-1")
                .sessionId("session-1")
                .tool("file-reader")
                .action(ActionType.READ)
                .resource(".env")
                .build();

        PolicyEvaluationResult result = policyEngine.evaluate(request);

        assertEquals(DecisionType.DENY, result.getDecision());
        assertEquals(90, result.getRiskScore());
    }

    @Test
    @DisplayName("4. .env.* access -> DENY")
    void testDotEnvWildcardDenied() {
        EvaluationRequest request = EvaluationRequest.builder()
                .agentId("agent-1")
                .sessionId("session-1")
                .tool("file-reader")
                .action(ActionType.READ)
                .resource(".env.production")
                .build();

        PolicyEvaluationResult result = policyEngine.evaluate(request);

        assertEquals(DecisionType.DENY, result.getDecision());
        assertEquals(90, result.getRiskScore());
    }

    @Test
    @DisplayName("5. .pem access -> DENY")
    void testPemFileDenied() {
        EvaluationRequest request = EvaluationRequest.builder()
                .agentId("agent-1")
                .sessionId("session-1")
                .tool("file-reader")
                .action(ActionType.READ)
                .resource("certs/id_rsa.pem")
                .build();

        PolicyEvaluationResult result = policyEngine.evaluate(request);

        assertEquals(DecisionType.DENY, result.getDecision());
        assertEquals(90, result.getRiskScore());
    }

    @Test
    @DisplayName("6. .key access -> DENY")
    void testKeyFileDenied() {
        EvaluationRequest request = EvaluationRequest.builder()
                .agentId("agent-1")
                .sessionId("session-1")
                .tool("file-reader")
                .action(ActionType.READ)
                .resource("keys/private.key")
                .build();

        PolicyEvaluationResult result = policyEngine.evaluate(request);

        assertEquals(DecisionType.DENY, result.getDecision());
        assertEquals(90, result.getRiskScore());
    }

    @Test
    @DisplayName("7. secret resource -> DENY")
    void testSecretResourceDenied() {
        EvaluationRequest request = EvaluationRequest.builder()
                .agentId("agent-1")
                .sessionId("session-1")
                .tool("file-reader")
                .action(ActionType.READ)
                .resource("config/app-secret.json")
                .build();

        PolicyEvaluationResult result = policyEngine.evaluate(request);

        assertEquals(DecisionType.DENY, result.getDecision());
        assertEquals(90, result.getRiskScore());
    }

    @Test
    @DisplayName("8. credential resource -> DENY")
    void testCredentialResourceDenied() {
        EvaluationRequest request = EvaluationRequest.builder()
                .agentId("agent-1")
                .sessionId("session-1")
                .tool("file-reader")
                .action(ActionType.READ)
                .resource("aws/credentials.xml")
                .build();

        PolicyEvaluationResult result = policyEngine.evaluate(request);

        assertEquals(DecisionType.DENY, result.getDecision());
        assertEquals(90, result.getRiskScore());
    }

    @Test
    @DisplayName("9. password resource -> DENY")
    void testPasswordResourceDenied() {
        EvaluationRequest request = EvaluationRequest.builder()
                .agentId("agent-1")
                .sessionId("session-1")
                .tool("file-reader")
                .action(ActionType.READ)
                .resource("db/db-password.txt")
                .build();

        PolicyEvaluationResult result = policyEngine.evaluate(request);

        assertEquals(DecisionType.DENY, result.getDecision());
        assertEquals(90, result.getRiskScore());
    }

    @Test
    @DisplayName("10. DELETE production resource -> DENY")
    void testDeleteProductionResourceDenied() {
        EvaluationRequest request = EvaluationRequest.builder()
                .agentId("agent-1")
                .sessionId("session-1")
                .tool("db-tool")
                .action(ActionType.DELETE)
                .resource("production/users-table")
                .build();

        PolicyEvaluationResult result = policyEngine.evaluate(request);

        assertEquals(DecisionType.DENY, result.getDecision());
        assertEquals(95, result.getRiskScore());
    }

    @Test
    @DisplayName("11. DELETE non-production resource -> REVIEW")
    void testDeleteNonProductionResourceReview() {
        EvaluationRequest request = EvaluationRequest.builder()
                .agentId("agent-1")
                .sessionId("session-1")
                .tool("file-remover")
                .action(ActionType.DELETE)
                .resource("dev/temp-cache.txt")
                .build();

        PolicyEvaluationResult result = policyEngine.evaluate(request);

        assertEquals(DecisionType.REVIEW, result.getDecision());
        assertEquals(60, result.getRiskScore());
    }

    @Test
    @DisplayName("12. EXECUTE admin resource -> REVIEW")
    void testExecuteAdminResourceReview() {
        EvaluationRequest request = EvaluationRequest.builder()
                .agentId("agent-1")
                .sessionId("session-1")
                .tool("bash")
                .action(ActionType.EXECUTE)
                .resource("admin/system-reset.sh")
                .build();

        PolicyEvaluationResult result = policyEngine.evaluate(request);

        assertEquals(DecisionType.REVIEW, result.getDecision());
        assertEquals(75, result.getRiskScore());
    }

    @Test
    @DisplayName("13. EXECUTE protected resource -> REVIEW")
    void testExecuteProtectedResourceReview() {
        EvaluationRequest request = EvaluationRequest.builder()
                .agentId("agent-1")
                .sessionId("session-1")
                .tool("bash")
                .action(ActionType.EXECUTE)
                .resource("protected/kernel-module")
                .build();

        PolicyEvaluationResult result = policyEngine.evaluate(request);

        assertEquals(DecisionType.REVIEW, result.getDecision());
        assertEquals(75, result.getRiskScore());
    }

    @Test
    @DisplayName("14. EXTERNAL_REQUEST with sensitive resource -> REVIEW")
    void testExternalRequestWithSensitiveResourceReview() {
        EvaluationRequest request = EvaluationRequest.builder()
                .agentId("agent-1")
                .sessionId("session-1")
                .tool("http-client")
                .action(ActionType.EXTERNAL_REQUEST)
                .resource("https://api.external.com/prod/sync")
                .build();

        PolicyEvaluationResult result = policyEngine.evaluate(request);

        assertEquals(DecisionType.REVIEW, result.getDecision());
        assertEquals(75, result.getRiskScore());
    }
}
