package com.agentshield.gateway;

import com.agentshield.audit.AuditService;
import com.agentshield.dto.EvaluationRequest;
import com.agentshield.dto.EvaluationResponse;
import com.agentshield.model.DecisionType;
import com.agentshield.model.ResourceSensitivity;
import com.agentshield.permission.AuthorizationDecision;
import com.agentshield.permission.PermissionEngine;
import com.agentshield.policy.PolicyEngine;
import com.agentshield.policy.PolicyEvaluationResult;
import com.agentshield.security.AuthenticatedAgent;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.UUID;

/**
 * Primary orchestration service for AgentShield Security Gateway.
 *
 * Decision hierarchy:
 * 0. API key authentication (Spring Security filter) — failure is HTTP 401 before this service runs.
 * 1. PermissionEngine (identity claim, tool registry, explicit grant) — any failure is a final DENY.
 * 2. PolicyEngine (resource/action risk) — runs only for authorized requests and can only
 *    ALLOW, REVIEW or DENY what authorization already permitted; it can never grant access.
 */
@Service
public class GatewayService {

    /** Risk score recorded when a request is denied by authorization (fail-closed maximum). */
    static final int AUTHORIZATION_DENIAL_RISK_SCORE = 100;

    private final PermissionEngine permissionEngine;
    private final PolicyEngine policyEngine;
    private final AuditService auditService;

    @Autowired
    public GatewayService(PermissionEngine permissionEngine, PolicyEngine policyEngine, AuditService auditService) {
        this.permissionEngine = permissionEngine;
        this.policyEngine = policyEngine;
        this.auditService = auditService;
    }

    public EvaluationResponse evaluateRequest(EvaluationRequest request, AuthenticatedAgent caller) {
        UUID requestId = UUID.randomUUID();
        Instant timestamp = Instant.now();

        // 1. Authorize the authenticated agent: identity claim, tool registration and explicit permission grant
        AuthorizationDecision authorization = permissionEngine.authorize(
                caller, request.getAgentId(), request.getTool(), request.getAction());

        // 2. Evaluate security policy rules and risk heuristics only for authorized requests
        PolicyEvaluationResult result = authorization.isAuthorized()
                ? policyEngine.evaluate(request)
                : authorizationDenial(authorization);

        // 3. Audit record every evaluation
        auditService.recordEvaluation(request, requestId, result, authorization, timestamp);

        // 4. Assemble EvaluationResponse
        return EvaluationResponse.builder()
                .requestId(requestId)
                .agentId(request.getAgentId())
                .sessionId(request.getSessionId())
                .action(request.getAction())
                .resource(request.getResource())
                .decision(result.getDecision())
                .reason(result.getReason())
                .riskScore(result.getRiskScore())
                .authorizationResult(authorization.result())
                .timestamp(timestamp)
                .build();
    }

    private PolicyEvaluationResult authorizationDenial(AuthorizationDecision authorization) {
        return PolicyEvaluationResult.builder()
                .decision(DecisionType.DENY)
                .reason("Authorization failed: " + authorization.reason())
                .riskScore(AUTHORIZATION_DENIAL_RISK_SCORE)
                .resourceSensitivity(ResourceSensitivity.CRITICAL)
                .build();
    }
}
