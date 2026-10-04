package com.agentshield.dto;

import com.agentshield.audit.AuditLog;
import com.agentshield.model.ActionOutcome;
import com.agentshield.model.ActionType;
import com.agentshield.model.AuthorizationResult;
import com.agentshield.model.DecisionType;
import com.agentshield.model.ResourceSensitivity;

import java.time.Instant;
import java.util.UUID;

/**
 * Audit log record returned by the read-only Audit API (GET /api/v1/audit/{requestId},
 * GET /api/v1/audit). Mirrors AuditLog's persisted fields directly: AuditLog never stores
 * request metadata, API keys or other credentials (see AuditService.recordEvaluation — only
 * agentId/sessionId/tool/action/resource and the resulting decision are written), so no
 * field here needs redaction before exposure to an admin caller.
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
        Instant timestamp
) {
    public static AuditLogResponse from(AuditLog log) {
        return new AuditLogResponse(log.getId(), log.getRequestId(), log.getAgentId(), log.getSessionId(),
                log.getTool(), log.getAction(), log.getResource(), log.getResourceSensitivity(), log.getDecision(),
                log.getRiskScore(), log.getReason(), log.getActionOutcome(), log.getRegisteredAgentId(),
                log.getRegisteredToolId(), log.getAuthorizationResult(), log.getAuthorizationReason(),
                log.getTimestamp());
    }
}
