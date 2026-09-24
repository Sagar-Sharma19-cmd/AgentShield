package com.agentshield.audit;

import com.agentshield.dto.EvaluationRequest;
import com.agentshield.model.ActionOutcome;
import com.agentshield.model.DecisionType;
import com.agentshield.policy.PolicyEvaluationResult;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

/**
 * Service managing audit logging of all security evaluation decisions.
 */
@Service
public class AuditService {

    private final AuditRepository auditRepository;

    @Autowired
    public AuditService(AuditRepository auditRepository) {
        this.auditRepository = auditRepository;
    }

    @Transactional
    public AuditLog recordEvaluation(EvaluationRequest request,
                                      UUID requestId,
                                      PolicyEvaluationResult result,
                                      Instant timestamp) {
        ActionOutcome outcome = mapOutcome(result.getDecision());

        AuditLog log = AuditLog.builder()
                .requestId(requestId)
                .agentId(request.getAgentId())
                .sessionId(request.getSessionId())
                .tool(request.getTool())
                .action(request.getAction())
                .resource(request.getResource())
                .resourceSensitivity(result.getResourceSensitivity())
                .decision(result.getDecision())
                .riskScore(result.getRiskScore())
                .reason(result.getReason())
                .actionOutcome(outcome)
                .timestamp(timestamp)
                .build();

        return auditRepository.save(log);
    }

    @Transactional(readOnly = true)
    public List<AuditLog> getAuditLogsForAgent(String agentId) {
        return auditRepository.findByAgentId(agentId);
    }

    @Transactional(readOnly = true)
    public List<AuditLog> getAuditLogsForSession(String sessionId) {
        return auditRepository.findBySessionId(sessionId);
    }

    private ActionOutcome mapOutcome(DecisionType decision) {
        return switch (decision) {
            case ALLOW -> ActionOutcome.ALLOWED;
            case REVIEW -> ActionOutcome.REVIEW_REQUIRED;
            case DENY -> ActionOutcome.BLOCKED;
        };
    }
}
