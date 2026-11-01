package com.agentshield.trajectory;

import com.agentshield.audit.AuditLog;
import com.agentshield.model.ActionType;
import com.agentshield.model.DecisionType;
import com.agentshield.model.ResourceSensitivity;

import java.time.Instant;

/**
 * One gateway event as seen by trajectory analysis: a previous audit row, or the current
 * candidate request (with the decision it would receive before trajectory escalation).
 *
 * The resource string is intentionally not carried. The features use the action, tool,
 * sensitivity and decision, and resource text is the most sensitive field in the audit row.
 */
public record TrajectoryEvent(
        Instant timestamp,
        ActionType action,
        String tool,
        ResourceSensitivity resourceSensitivity,
        DecisionType decision) {

    public static TrajectoryEvent from(AuditLog log) {
        return new TrajectoryEvent(log.getTimestamp(), log.getAction(), log.getTool(),
                log.getResourceSensitivity(), log.getDecision());
    }

    public static TrajectoryEvent candidate(Instant timestamp, ActionType action, String tool,
                                            ResourceSensitivity resourceSensitivity, DecisionType decision) {
        return new TrajectoryEvent(timestamp, action, tool, resourceSensitivity, decision);
    }
}
