package com.agentshield.gateway;

import com.agentshield.audit.AuditService;
import com.agentshield.dto.EvaluationRequest;
import com.agentshield.dto.EvaluationResponse;
import com.agentshield.policy.PolicyEngine;
import com.agentshield.policy.PolicyEvaluationResult;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.UUID;

/**
 * Primary orchestration service for AgentShield Security Gateway.
 */
@Service
public class GatewayService {

    private final PolicyEngine policyEngine;
    private final AuditService auditService;

    @Autowired
    public GatewayService(PolicyEngine policyEngine, AuditService auditService) {
        this.policyEngine = policyEngine;
        this.auditService = auditService;
    }

    public EvaluationResponse evaluateRequest(EvaluationRequest request) {
        UUID requestId = UUID.randomUUID();
        Instant timestamp = Instant.now();

        // 1. Evaluate security policy rules and risk heuristics
        PolicyEvaluationResult result = policyEngine.evaluate(request);

        // 2. Audit record every evaluation
        auditService.recordEvaluation(request, requestId, result, timestamp);

        // 3. Assemble EvaluationResponse
        return EvaluationResponse.builder()
                .requestId(requestId)
                .agentId(request.getAgentId())
                .sessionId(request.getSessionId())
                .action(request.getAction())
                .resource(request.getResource())
                .decision(result.getDecision())
                .reason(result.getReason())
                .riskScore(result.getRiskScore())
                .timestamp(timestamp)
                .build();
    }
}
