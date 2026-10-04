package com.agentshield.gateway;

import com.agentshield.audit.AuditService;
import com.agentshield.dto.EvaluationRequest;
import com.agentshield.dto.EvaluationResponse;
import com.agentshield.model.DecisionType;
import com.agentshield.model.ResourceSensitivity;
import com.agentshield.model.RiskTier;
import com.agentshield.permission.AuthorizationDecision;
import com.agentshield.permission.PermissionEngine;
import com.agentshield.policy.PolicyEngine;
import com.agentshield.policy.PolicyEvaluationResult;
import com.agentshield.riskengine.RiskAssessment;
import com.agentshield.riskengine.RiskAssessmentService;
import com.agentshield.riskengine.RiskEngineClient;
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
 *    The Risk Engine is never consulted for an unauthorized request.
 * 2. PolicyEngine (resource/action risk) — runs only for authorized requests and can only
 *    ALLOW, REVIEW or DENY what authorization already permitted; it can never grant access.
 *    A policy DENY is final — the Risk Engine is not consulted (it could not downgrade it anyway).
 * 3. RiskEngineClient — consulted only when the policy decision is ALLOW or REVIEW. Its risk
 *    tier can only escalate that decision (see DecisionEscalator); it can never grant or
 *    downgrade authorization. A Risk Engine failure/timeout escalates in risk terms (fails
 *    safely to HIGH/REVIEW territory) rather than failing open.
 */
@Service
public class GatewayService {

    /** Risk score recorded when a request is denied by authorization (fail-closed maximum). */
    static final int AUTHORIZATION_DENIAL_RISK_SCORE = 100;

    private final PermissionEngine permissionEngine;
    private final PolicyEngine policyEngine;
    private final AuditService auditService;
    private final RiskEngineClient riskEngineClient;
    private final DecisionEscalator decisionEscalator;
    private final RiskAssessmentService riskAssessmentService;

    @Autowired
    public GatewayService(PermissionEngine permissionEngine, PolicyEngine policyEngine, AuditService auditService,
                          RiskEngineClient riskEngineClient, DecisionEscalator decisionEscalator,
                          RiskAssessmentService riskAssessmentService) {
        this.permissionEngine = permissionEngine;
        this.policyEngine = policyEngine;
        this.auditService = auditService;
        this.riskEngineClient = riskEngineClient;
        this.decisionEscalator = decisionEscalator;
        this.riskAssessmentService = riskAssessmentService;
    }

    public EvaluationResponse evaluateRequest(EvaluationRequest request, AuthenticatedAgent caller) {
        UUID requestId = UUID.randomUUID();
        Instant timestamp = Instant.now();

        // 1. Authorize the authenticated agent: identity claim, tool registration and explicit permission grant
        AuthorizationDecision authorization = permissionEngine.authorize(
                caller, request.getAgentId(), request.getTool(), request.getAction());

        if (!authorization.isAuthorized()) {
            // Permission denial is authoritative: the Risk Engine is never called.
            PolicyEvaluationResult denial = authorizationDenial(authorization);
            auditService.recordEvaluation(request, requestId, denial, authorization, timestamp);
            return buildResponse(requestId, request, denial, authorization, null, null, timestamp);
        }

        // 2. Evaluate security policy rules for the authorized request
        PolicyEvaluationResult policyResult = policyEngine.evaluate(request);

        if (policyResult.getDecision() == DecisionType.DENY) {
            // Policy denial is authoritative: the Risk Engine cannot downgrade it, so it is
            // not consulted.
            auditService.recordEvaluation(request, requestId, policyResult, authorization, timestamp);
            return buildResponse(requestId, request, policyResult, authorization, null, null, timestamp);
        }

        // 3. Risk Engine is an escalation-only signal for ALLOW/REVIEW policy outcomes.
        RiskAssessment riskAssessment = riskEngineClient.assessRisk(
                request.getAction(), request.getResource(), policyResult.getResourceSensitivity());
        riskAssessmentService.persist(requestId, riskAssessment, timestamp);

        DecisionType finalDecision = decisionEscalator.combine(policyResult.getDecision(), riskAssessment.riskTier());
        PolicyEvaluationResult finalResult = withEscalatedDecision(policyResult, finalDecision, riskAssessment);

        // 4. Audit the final (possibly escalated) decision
        auditService.recordEvaluation(request, requestId, finalResult, authorization, timestamp);

        return buildResponse(requestId, request, finalResult, authorization,
                riskAssessment.riskTier(), riskAssessment.engineAvailable(), timestamp);
    }

    private PolicyEvaluationResult withEscalatedDecision(PolicyEvaluationResult policyResult,
                                                          DecisionType finalDecision,
                                                          RiskAssessment riskAssessment) {
        if (finalDecision == policyResult.getDecision()) {
            return policyResult;
        }
        String escalationNote = " Escalated to " + finalDecision + " by Risk Engine assessment ("
                + riskAssessment.riskTier()
                + (riskAssessment.engineAvailable() ? "" : ", " + riskAssessment.reason())
                + ").";
        return PolicyEvaluationResult.builder()
                .decision(finalDecision)
                .reason(policyResult.getReason() + escalationNote)
                .riskScore(policyResult.getRiskScore())
                .resourceSensitivity(policyResult.getResourceSensitivity())
                .build();
    }

    private EvaluationResponse buildResponse(UUID requestId, EvaluationRequest request, PolicyEvaluationResult result,
                                              AuthorizationDecision authorization, RiskTier riskTier,
                                              Boolean riskEngineAvailable, Instant timestamp) {
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
                .riskTier(riskTier)
                .riskEngineAvailable(riskEngineAvailable)
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
