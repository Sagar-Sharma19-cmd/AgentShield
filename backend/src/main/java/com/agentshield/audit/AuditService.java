package com.agentshield.audit;

import com.agentshield.dto.EvaluationRequest;
import com.agentshield.exception.ResourceNotFoundException;
import com.agentshield.inspection.InspectionResult;
import com.agentshield.model.ActionOutcome;
import com.agentshield.model.AuthorizationResult;
import com.agentshield.model.DecisionType;
import com.agentshield.model.EscalationSource;
import com.agentshield.permission.AuthorizationDecision;
import com.agentshield.policy.PolicyEvaluationResult;
import com.agentshield.trajectory.TrajectoryEvaluation;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;
import java.util.Objects;
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

    /**
     * Records an evaluation with no trajectory result and no escalation. Used for authorization and
     * policy denials, which never reach trajectory analysis. Trajectory fields are stored as NULL
     * (not evaluated) and escalated_by as NONE.
     */
    @Transactional
    public AuditLog recordEvaluation(EvaluationRequest request,
                                      UUID requestId,
                                      PolicyEvaluationResult result,
                                      AuthorizationDecision authorization,
                                      Instant timestamp) {
        return recordEvaluation(request, requestId, result, authorization, timestamp, null, EscalationSource.NONE);
    }

    /**
     * Records an evaluation with its trajectory result and the signal that changed the decision.
     *
     * @param trajectory   the trajectory result, or null when trajectory was not evaluated
     * @param escalatedBy  the signal that changed the decision (never null)
     */
    @Transactional
    public AuditLog recordEvaluation(EvaluationRequest request,
                                      UUID requestId,
                                      PolicyEvaluationResult result,
                                      AuthorizationDecision authorization,
                                      Instant timestamp,
                                      TrajectoryEvaluation trajectory,
                                      EscalationSource escalatedBy) {
        return recordEvaluation(request, request.getResource(), requestId, result, authorization, timestamp,
                trajectory, escalatedBy, InspectionResult.NOT_INSPECTED);
    }

    /**
     * As above, plus the content inspection result (V13) and the resource to store. Only the verdict and the
     * REDACTED findings are written; {@code request.getArguments()} is never read here, so the inspected
     * arguments cannot reach the audit table. {@code storedResource} is the request's resource, or a redacted
     * copy when inspection found a secret in it.
     */
    @Transactional
    public AuditLog recordEvaluation(EvaluationRequest request,
                                      String storedResource,
                                      UUID requestId,
                                      PolicyEvaluationResult result,
                                      AuthorizationDecision authorization,
                                      Instant timestamp,
                                      TrajectoryEvaluation trajectory,
                                      EscalationSource escalatedBy,
                                      InspectionResult inspection) {
        ActionOutcome outcome = mapOutcome(result.getDecision());

        AuditLog log = AuditLog.builder()
                .requestId(requestId)
                .agentId(request.getAgentId())
                .sessionId(request.getSessionId())
                .tool(request.getTool())
                .action(request.getAction())
                .resource(storedResource)
                .resourceSensitivity(result.getResourceSensitivity())
                .decision(result.getDecision())
                .riskScore(result.getRiskScore())
                .reason(result.getReason())
                .actionOutcome(outcome)
                .registeredAgentId(authorization.agentId())
                .registeredToolId(authorization.toolId())
                .authorizationResult(authorization.result())
                .authorizationReason(authorization.reason())
                .trajectoryScore(trajectory == null ? null : trajectory.score())
                .trajectoryTier(trajectory == null ? null : trajectory.tier())
                .trajectoryReason(trajectory == null ? null : trajectory.reason())
                .escalatedBy(Objects.requireNonNull(escalatedBy, "escalatedBy"))
                .inspectionVerdict(inspection.verdict())
                .inspectionFindings(inspection.findingsOrNull())
                .timestamp(timestamp)
                .build();

        return auditRepository.save(log);
    }

    /**
     * Audit row for an output inspection (POST /api/v1/gateway/inspect): action READ on {@code output:<tool>},
     * with the verdict and the redacted findings. The inspected content is never stored.
     */
    @Transactional
    public AuditLog recordOutputInspection(UUID requestId, String agentName, UUID agentId, String sessionId,
                                           String tool, PolicyEvaluationResult result, EscalationSource escalatedBy,
                                           InspectionResult inspection, Instant timestamp) {
        AuditLog log = AuditLog.builder()
                .requestId(requestId)
                .agentId(agentName)
                .sessionId(sessionId)
                .tool(tool)
                .action(com.agentshield.model.ActionType.READ)
                .resource("output:" + tool)
                .resourceSensitivity(result.getResourceSensitivity())
                .decision(result.getDecision())
                .riskScore(result.getRiskScore())
                .reason(result.getReason())
                .actionOutcome(mapOutcome(result.getDecision()))
                .registeredAgentId(agentId)
                .authorizationResult(AuthorizationResult.AUTHORIZED)
                .authorizationReason("Output inspection by the authenticated, active agent. No tool grant is needed to inspect output.")
                .escalatedBy(escalatedBy)
                .inspectionVerdict(inspection.verdict())
                .inspectionFindings(inspection.findingsOrNull())
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

    /**
     * Looks up the single audit row for a gateway request (Audit Read API,
     * GET /api/v1/audit/{requestId}). One row is written per requestId — see
     * GatewayService.evaluateRequest — so a missing row means the id is unknown.
     */
    @Transactional(readOnly = true)
    public AuditLog getByRequestId(UUID requestId) {
        return auditRepository.findByRequestId(requestId)
                .orElseThrow(() -> new ResourceNotFoundException("Audit log not found for requestId " + requestId));
    }

    /**
     * Paginated, filterable search backing the Audit Read API's list endpoint
     * (GET /api/v1/audit). All filters are optional; absent ones impose no
     * predicate (see AuditLogSpecifications). Always ordered by timestamp DESC —
     * callers cannot control sort order, so arbitrary entity fields can never
     * become client-controlled sort expressions. page/size are expected to already
     * be validated (page >= 0, 1 <= size <= max) by the controller boundary.
     */
    @Transactional(readOnly = true)
    public Page<AuditLog> search(String agentId, DecisionType decision, AuthorizationResult authorizationResult,
                                  Instant from, Instant to, int page, int size) {
        Specification<AuditLog> spec = Specification.allOf(
                AuditLogSpecifications.agentIdEquals(agentId),
                AuditLogSpecifications.decisionEquals(decision),
                AuditLogSpecifications.authorizationResultEquals(authorizationResult),
                AuditLogSpecifications.timestampFrom(from),
                AuditLogSpecifications.timestampTo(to));
        Pageable pageable = PageRequest.of(page, size, Sort.by(Sort.Direction.DESC, "timestamp"));
        return auditRepository.findAll(spec, pageable);
    }

    private ActionOutcome mapOutcome(DecisionType decision) {
        return switch (decision) {
            case ALLOW -> ActionOutcome.ALLOWED;
            case REVIEW -> ActionOutcome.REVIEW_REQUIRED;
            case DENY -> ActionOutcome.BLOCKED;
        };
    }
}
