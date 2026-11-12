package com.agentshield.dto;

import com.agentshield.inspection.Finding;
import com.agentshield.inspection.InspectionVerdict;
import java.util.List;

import com.agentshield.audit.AuditLog;
import com.agentshield.model.ActionOutcome;
import com.agentshield.model.ActionType;
import com.agentshield.model.AuthorizationResult;
import com.agentshield.model.DecisionType;
import com.agentshield.model.EscalationSource;
import com.agentshield.model.ResourceSensitivity;
import com.agentshield.model.RiskTier;

import java.time.Instant;
import java.util.UUID;

/**
 * Audit log record returned by the read-only Audit API (GET /api/v1/audit/{requestId},
 * GET /api/v1/audit). Mirrors AuditLog's persisted fields directly: AuditLog never stores
 * request metadata, API keys or other credentials (see AuditService.recordEvaluation — only
 * agentId/sessionId/tool/action/resource and the resulting decision are written), so no
 * field here needs redaction before exposure to an admin caller.
 *
 * The trajectory fields are additive (V9). trajectoryScore/Tier/Reason are null when trajectory
 * was not evaluated. escalatedBy is null only on rows written before V9.
 *
 * inspectionVerdict/inspectionFindings are additive (V13). Findings are redacted when they are recorded: a type,
 * a JSON path and a preview such as "AKIA… (20 chars)". The inspected arguments are never stored.
 */
public record AuditLogResponse(
        UUID id,
        UUID requestId,
        String agentId,
        String sessionId,
        String tool,
        ActionType action,
        String resource,
        ResourceSensitivity resourceSensitivity,
        DecisionType decision,
        int riskScore,
        String reason,
        ActionOutcome actionOutcome,
        UUID registeredAgentId,
        UUID registeredToolId,
        AuthorizationResult authorizationResult,
        String authorizationReason,
        Instant timestamp,
        Integer trajectoryScore,
        RiskTier trajectoryTier,
        String trajectoryReason,
        EscalationSource escalatedBy,
        /** Content inspection verdict (V13); null when inspection did not run or the row predates V13. */
        InspectionVerdict inspectionVerdict,
        /** Redacted content findings (V13); null when inspection did not run. Never raw values. */
        List<Finding> inspectionFindings
) {
    public static AuditLogResponse from(AuditLog log) {
        return new AuditLogResponse(log.getId(), log.getRequestId(), log.getAgentId(), log.getSessionId(),
                log.getTool(), log.getAction(), log.getResource(), log.getResourceSensitivity(), log.getDecision(),
                log.getRiskScore(), log.getReason(), log.getActionOutcome(), log.getRegisteredAgentId(),
                log.getRegisteredToolId(), log.getAuthorizationResult(), log.getAuthorizationReason(),
                log.getTimestamp(), log.getTrajectoryScore(), log.getTrajectoryTier(), log.getTrajectoryReason(),
                log.getEscalatedBy(), log.getInspectionVerdict(), log.getInspectionFindings());
    }
}
