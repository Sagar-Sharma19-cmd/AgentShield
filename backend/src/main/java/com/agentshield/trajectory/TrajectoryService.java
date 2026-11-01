package com.agentshield.trajectory;

import com.agentshield.audit.AuditRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
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

    @Autowired
    public TrajectoryService(AuditRepository auditRepository, TrajectoryEvaluator trajectoryEvaluator) {
        this.auditRepository = auditRepository;
        this.trajectoryEvaluator = trajectoryEvaluator;
    }

    /**
     * @return the evaluation, or empty when it could not be computed (no verified agent, or the
     *         history query failed). Empty is "not evaluated", which is distinct from a score of 0.
     */
    @Transactional(readOnly = true)
    public Optional<TrajectoryEvaluation> evaluate(UUID requestId, String sessionId, UUID registeredAgentId,
                                                   TrajectoryEvent candidate) {
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
            log.error("Trajectory history query failed for requestId {}; keeping the existing decision and "
                    + "recording trajectory as not evaluated: {}", requestId, e.getMessage(), e);
            return Optional.empty();
        }

        return Optional.of(trajectoryEvaluator.evaluate(history, candidate));
    }
}
