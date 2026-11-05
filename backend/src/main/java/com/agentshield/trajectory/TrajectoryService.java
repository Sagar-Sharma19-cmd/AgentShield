package com.agentshield.trajectory;

import com.agentshield.audit.AuditRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * Loads the session history for one gateway request and runs TrajectoryEvaluator on it.
 *
 * Session isolation: history is keyed on (sessionId, registeredAgentId). registeredAgentId
 * is the server-verified caller, not the agentId the client claims, so one agent cannot
 * write into, or read, another agent's session history.
 *
 * Failure handling: if the history cannot be read, the result is empty, never a score.
 * The caller then keeps the existing decision. A failed read is not treated as "no history"
 * or as a normal trajectory.
 */
@Service
public class TrajectoryService {

    private static final Logger log = LoggerFactory.getLogger(TrajectoryService.class);

    private final AuditRepository auditRepository;
    private final TrajectoryEvaluator trajectoryEvaluator;
    private final boolean enabled;

    /**
     * @param enabled kill switch (agentshield.trajectory.enabled, default true). When false, no history
     *                is read and no evaluation runs, so the result is always "not evaluated".
     */
    @Autowired
    public TrajectoryService(AuditRepository auditRepository, TrajectoryEvaluator trajectoryEvaluator,
                             @Value("${agentshield.trajectory.enabled:true}") boolean enabled) {
        this.auditRepository = auditRepository;
        this.trajectoryEvaluator = trajectoryEvaluator;
        this.enabled = enabled;
    }

    /** Enabled service, for callers that do not use the kill switch. */
    public TrajectoryService(AuditRepository auditRepository, TrajectoryEvaluator trajectoryEvaluator) {
        this(auditRepository, trajectoryEvaluator, true);
    }

    /**
     * @return the evaluation, or empty when it could not be computed (no verified agent, or the
     *         history query failed). Empty is "not evaluated", which is distinct from a score of 0.
     */
    /*
     * NOT_SUPPORTED: the history read runs outside the caller's transaction. A failed query inside a
     * transaction marks it rollback-only, and catching the exception does not undo that mark, so the
     * commit would later throw UnexpectedRollbackException and turn "keep the decision" into an
     * HTTP 500. Outside a transaction the failure stays local and the fail-safe path below holds.
     * The read only needs committed history, so no transaction is required.
     */
    @Transactional(propagation = Propagation.NOT_SUPPORTED)
    public Optional<TrajectoryEvaluation> evaluate(UUID requestId, String sessionId, UUID registeredAgentId,
                                                   TrajectoryEvent candidate) {
        if (!enabled) {
            // Kill switch: no history read and no evaluation. Reported as "not evaluated".
            return Optional.empty();
        }
        if (registeredAgentId == null) {
            log.warn("Trajectory analysis skipped for requestId {}: no verified agent to scope history to.", requestId);
            return Optional.empty();
        }

        List<TrajectoryEvent> history;
        try {
            history = auditRepository.findTop10BySessionIdAndRegisteredAgentIdOrderByTimestampDesc(sessionId, registeredAgentId)
                    .stream()
                    .map(TrajectoryEvent::from)
                    .toList();
        } catch (RuntimeException e) {
            log.error("Trajectory history lookup failed for requestId {}; keeping the existing decision and "
                    + "recording trajectory as not evaluated: {}", requestId, e.getMessage(), e);
            return Optional.empty();
        }

        // Evaluator failures are caught separately from lookup failures so each is logged with its own cause.
        // Only RuntimeException is caught. Errors (including fatal JVM errors) are never swallowed.
        try {
            return Optional.of(trajectoryEvaluator.evaluate(history, candidate));
        } catch (RuntimeException e) {
            log.error("Trajectory evaluator failed for requestId {}; keeping the existing decision and "
                    + "recording trajectory as not evaluated: {}", requestId, e.getMessage(), e);
            return Optional.empty();
        }
    }
}
