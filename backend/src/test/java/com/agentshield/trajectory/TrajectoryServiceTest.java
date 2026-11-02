package com.agentshield.trajectory;

import com.agentshield.audit.AuditLog;
import com.agentshield.audit.AuditRepository;
import com.agentshield.model.ActionType;
import com.agentshield.model.DecisionType;
import com.agentshield.model.ResourceSensitivity;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.dao.DataAccessResourceFailureException;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class TrajectoryServiceTest {

    private static final Instant NOW = Instant.parse("2026-01-01T12:00:00Z");

    @Mock
    private AuditRepository auditRepository;

    private TrajectoryService trajectoryService;

    @BeforeEach
    void setUp() {
        trajectoryService = new TrajectoryService(auditRepository, new TrajectoryEvaluator());
    }

    @Test
    @DisplayName("History query is scoped to the session and the verified agent, and the history is evaluated")
    void scopesQueryAndEvaluatesHistory() {
        UUID agentId = UUID.randomUUID();
        when(auditRepository.findTop10BySessionIdAndRegisteredAgentIdOrderByTimestampDesc("session-1", agentId))
                .thenReturn(List.of(auditRow(DecisionType.DENY, NOW.minusSeconds(5))));

        Optional<TrajectoryEvaluation> result = trajectoryService.evaluate(UUID.randomUUID(), "session-1", agentId,
                candidate());

        verify(auditRepository).findTop10BySessionIdAndRegisteredAgentIdOrderByTimestampDesc("session-1", agentId);
        assertTrue(result.isPresent());
        assertEquals(1, result.get().historySize());
    }

    @Test
    @DisplayName("A failed history query returns empty (not a score), and does not throw")
    void historyFailureReturnsEmpty() {
        when(auditRepository.findTop10BySessionIdAndRegisteredAgentIdOrderByTimestampDesc(anyString(), any()))
                .thenThrow(new DataAccessResourceFailureException("database unavailable"));

        Optional<TrajectoryEvaluation> result = trajectoryService.evaluate(UUID.randomUUID(), "session-1",
                UUID.randomUUID(), candidate());

        assertTrue(result.isEmpty());
    }

    @Test
    @DisplayName("Without a verified agent, history is never queried (no cross-agent read) and the result is empty")
    void missingVerifiedAgentSkipsQuery() {
        Optional<TrajectoryEvaluation> result = trajectoryService.evaluate(UUID.randomUUID(), "session-1", null,
                candidate());

        assertTrue(result.isEmpty());
        verifyNoInteractions(auditRepository);
    }

    @Test
    @DisplayName("A session with no prior events is evaluated as an empty history (score 0), which differs from a failed read")
    void emptyHistoryIsEvaluatedNotFailed() {
        UUID agentId = UUID.randomUUID();
        when(auditRepository.findTop10BySessionIdAndRegisteredAgentIdOrderByTimestampDesc(eq("fresh"), eq(agentId)))
                .thenReturn(List.of());

        Optional<TrajectoryEvaluation> result = trajectoryService.evaluate(UUID.randomUUID(), "fresh", agentId,
                candidate());

        assertTrue(result.isPresent());
        assertEquals(0, result.get().score());
        assertEquals(0, result.get().historySize());
    }

    @Test
    @DisplayName("An evaluator RuntimeException returns empty (not evaluated), separately from lookup failures")
    void evaluatorRuntimeFailureReturnsEmpty() {
        TrajectoryEvaluator failing = org.mockito.Mockito.mock(TrajectoryEvaluator.class);
        TrajectoryService service = new TrajectoryService(auditRepository, failing);
        when(auditRepository.findTop10BySessionIdAndRegisteredAgentIdOrderByTimestampDesc(anyString(), any()))
                .thenReturn(List.of());
        when(failing.evaluate(any(), any())).thenThrow(new IllegalStateException("evaluator bug"));

        Optional<TrajectoryEvaluation> result = service.evaluate(UUID.randomUUID(), "session-1",
                UUID.randomUUID(), candidate());

        assertTrue(result.isEmpty());
    }

    @Test
    @DisplayName("An Error from the evaluator is not swallowed (only RuntimeException is caught)")
    void evaluatorErrorPropagates() {
        TrajectoryEvaluator failing = org.mockito.Mockito.mock(TrajectoryEvaluator.class);
        TrajectoryService service = new TrajectoryService(auditRepository, failing);
        when(auditRepository.findTop10BySessionIdAndRegisteredAgentIdOrderByTimestampDesc(anyString(), any()))
                .thenReturn(List.of());
        when(failing.evaluate(any(), any())).thenThrow(new OutOfMemoryError("simulated fatal error"));

        org.junit.jupiter.api.Assertions.assertThrows(OutOfMemoryError.class,
                () -> service.evaluate(UUID.randomUUID(), "session-1", UUID.randomUUID(), candidate()));
    }

    private static TrajectoryEvent candidate() {
        return TrajectoryEvent.candidate(NOW, ActionType.READ, "filesystem", ResourceSensitivity.INTERNAL,
                DecisionType.ALLOW);
    }

    private static AuditLog auditRow(DecisionType decision, Instant timestamp) {
        return AuditLog.builder()
                .requestId(UUID.randomUUID())
                .agentId("agent-a")
                .sessionId("session-1")
                .tool("filesystem")
                .action(ActionType.READ)
                .resource("src/main/App.java")
                .resourceSensitivity(ResourceSensitivity.INTERNAL)
                .decision(decision)
                .riskScore(10)
                .reason("test")
                .timestamp(timestamp)
                .build();
    }
}
