package com.agentshield.trajectory;

import com.agentshield.audit.AuditRepository;
import com.agentshield.model.ActionType;
import com.agentshield.model.DecisionType;
import com.agentshield.model.ResourceSensitivity;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

/** The agentshield.trajectory.enabled kill switch at the service level. */
@ExtendWith(MockitoExtension.class)
class TrajectoryKillSwitchTest {

    private static final Instant NOW = Instant.parse("2026-01-01T12:00:00Z");

    @Mock
    private AuditRepository auditRepository;

    @Test
    @DisplayName("Disabled: no history is read and the result is 'not evaluated'")
    void disabledSkipsHistoryAndEvaluation() {
        TrajectoryService service = new TrajectoryService(auditRepository, new TrajectoryEvaluator(), false);

        Optional<TrajectoryEvaluation> result = service.evaluate(UUID.randomUUID(), "session-1", UUID.randomUUID(),
                candidate());

        assertTrue(result.isEmpty());
        verifyNoInteractions(auditRepository);
    }

    @Test
    @DisplayName("Enabled (default constructor): history is read and evaluated")
    void enabledEvaluatesHistory() {
        UUID agentId = UUID.randomUUID();
        when(auditRepository.findTop10BySessionIdAndRegisteredAgentIdAndClaimedRequestIdIsNullOrderByTimestampDesc(anyString(), any()))
                .thenReturn(List.of());
        TrajectoryService service = new TrajectoryService(auditRepository, new TrajectoryEvaluator());

        Optional<TrajectoryEvaluation> result = service.evaluate(UUID.randomUUID(), "session-1", agentId, candidate());

        assertTrue(result.isPresent());
        assertEquals(0, result.get().score());
        verify(auditRepository).findTop10BySessionIdAndRegisteredAgentIdAndClaimedRequestIdIsNullOrderByTimestampDesc("session-1", agentId);
    }

    private static TrajectoryEvent candidate() {
        return TrajectoryEvent.candidate(NOW, ActionType.READ, "filesystem", ResourceSensitivity.INTERNAL,
                DecisionType.ALLOW);
    }
}
