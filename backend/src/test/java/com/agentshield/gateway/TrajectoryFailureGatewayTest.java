package com.agentshield.gateway;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import com.agentshield.audit.AuditLog;
import com.agentshield.audit.AuditRepository;
import com.agentshield.model.DecisionType;
import com.agentshield.model.EscalationSource;
import com.agentshield.security.AgentApiKeyAuthenticationFilter;
import com.agentshield.trajectory.TrajectoryEvaluator;
import com.agentshield.trajectory.TrajectoryService;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import jakarta.persistence.EntityManagerFactory;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.orm.jpa.EntityManagerFactoryUtils;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.springframework.test.web.servlet.MvcResult;

import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;

/**
 * Trajectory failure handling through the real gateway. A history-lookup failure and an evaluator
 * RuntimeException both leave the decision unchanged, record trajectory as not evaluated (NULL fields),
 * and log at ERROR with the requestId. A fatal Error is not caught and fails the request.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class TrajectoryFailureGatewayTest extends AbstractTrajectoryGatewayTest {

    /** Same bean as the inherited auditRepository field, replaced by a mock so the history read can fail on demand. */
    @MockitoBean
    private AuditRepository auditRepositoryMock;

    @MockitoSpyBean
    private TrajectoryEvaluator trajectoryEvaluator;

    private Logger trajectoryLogger;
    private ListAppender<ILoggingEvent> logEvents;

    @BeforeEach
    void captureTrajectoryLogs() {
        trajectoryLogger = (Logger) LoggerFactory.getLogger(TrajectoryService.class);
        logEvents = new ListAppender<>();
        logEvents.start();
        trajectoryLogger.addAppender(logEvents);
        when(auditRepositoryMock.save(any())).thenAnswer(invocation -> invocation.getArgument(0));
    }

    @AfterEach
    void releaseTrajectoryLogs() {
        trajectoryLogger.detachAppender(logEvents);
    }

    @Test
    @DisplayName("History lookup failure: decision kept, trajectory NULL (not evaluated), failure logged with requestId")
    void historyLookupFailureIsRecordedAsNotEvaluated() throws Exception {
        when(auditRepositoryMock.findTop10BySessionIdAndRegisteredAgentIdAndClaimedRequestIdIsNullOrderByTimestampDesc(any(), any()))
                .thenThrow(new DataAccessResourceFailureException("history unavailable"));

        UUID requestId = requestIdOf(send("fail-lookup", "filesystem", "READ", "src/Main.java")
                .andExpect(jsonPath("$.decision").value("ALLOW"))
                .andExpect(jsonPath("$.reviewRequestId").doesNotExist()));

        assertNotCompletedWithTrajectory(requestId, DecisionType.ALLOW);
        assertErrorLoggedFor(requestId, "history lookup failed");
    }

    @Autowired
    private EntityManagerFactory entityManagerFactory;

    /**
     * Same failure as above, but as a real JPA repository produces it: a failed query inside an active
     * transaction marks that transaction rollback-only before the exception reaches TrajectoryService.
     * Catching the exception does not clear the mark, so if the history read ran inside a transaction,
     * the commit would throw UnexpectedRollbackException and the request would fail with 500.
     */
    @Test
    @DisplayName("History lookup failure that marks the transaction rollback-only still keeps the decision")
    void rollbackMarkingHistoryFailureStillKeepsTheDecision() throws Exception {
        when(auditRepositoryMock.findTop10BySessionIdAndRegisteredAgentIdAndClaimedRequestIdIsNullOrderByTimestampDesc(any(), any()))
                .thenAnswer(invocation -> {
                    if (TransactionSynchronizationManager.isActualTransactionActive()) {
                        EntityManagerFactoryUtils.getTransactionalEntityManager(entityManagerFactory)
                                .getTransaction().setRollbackOnly();
                    }
                    throw new DataAccessResourceFailureException("history unavailable");
                });

        UUID requestId = requestIdOf(send("fail-rollback", "filesystem", "READ", "src/Main.java")
                .andExpect(jsonPath("$.decision").value("ALLOW")));

        assertNotCompletedWithTrajectory(requestId, DecisionType.ALLOW);
        assertErrorLoggedFor(requestId, "history lookup failed");
    }

    @Test
    @DisplayName("Evaluator RuntimeException: decision kept, trajectory NULL (not evaluated), failure logged with requestId")
    void evaluatorRuntimeFailureIsRecordedAsNotEvaluated() throws Exception {
        when(auditRepositoryMock.findTop10BySessionIdAndRegisteredAgentIdAndClaimedRequestIdIsNullOrderByTimestampDesc(any(), any()))
                .thenReturn(List.of());
        doThrow(new IllegalStateException("evaluator bug")).when(trajectoryEvaluator).evaluate(any(), any());

        UUID requestId = requestIdOf(send("fail-eval", "filesystem", "READ", "src/Main.java")
                .andExpect(jsonPath("$.decision").value("ALLOW"))
                .andExpect(jsonPath("$.reviewRequestId").doesNotExist()));

        assertNotCompletedWithTrajectory(requestId, DecisionType.ALLOW);
        assertErrorLoggedFor(requestId, "evaluator failed");
    }

    /**
     * Trajectory code does not catch Errors (see TrajectoryServiceTest.evaluatorErrorPropagates). At the HTTP
     * boundary the request must not complete as a decision: it returns a 500 and writes no audit row, so a
     * fatal error is never recorded as "trajectory not evaluated".
     */
    @Test
    @DisplayName("Fatal Error from the evaluator is not recorded as a decision: 500 and no audit row")
    void fatalErrorIsNotCompletedAsADecision() throws Exception {
        when(auditRepositoryMock.findTop10BySessionIdAndRegisteredAgentIdAndClaimedRequestIdIsNullOrderByTimestampDesc(any(), any()))
                .thenReturn(List.of());
        doThrow(new OutOfMemoryError("simulated fatal error")).when(trajectoryEvaluator).evaluate(any(), any());

        MvcResult result = mockMvc.perform(post("/api/v1/gateway/evaluate")
                .header(AgentApiKeyAuthenticationFilter.HEADER, agentApiKey)
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(Map.of("agentId", AGENT_ID, "sessionId", "fail-fatal",
                        "tool", "filesystem", "action", "READ", "resource", "src/Main.java")))).andReturn();

        assertEquals(500, result.getResponse().getStatus(), "a fatal error must not complete as a decision");
        verify(auditRepositoryMock, never()).save(any());
    }

    /** The saved audit row must keep the policy decision, have NULL trajectory fields, and escalated_by NONE. */
    private void assertNotCompletedWithTrajectory(UUID requestId, DecisionType expected) {
        AuditLog row = savedAuditFor(requestId);
        assertEquals(expected, row.getDecision());
        assertEquals(10, row.getRiskScore(), "policy score unchanged");
        assertNull(row.getTrajectoryScore(), "not evaluated: score NULL");
        assertNull(row.getTrajectoryTier(), "not evaluated: tier NULL");
        assertNull(row.getTrajectoryReason(), "not evaluated: reason NULL");
        assertEquals(EscalationSource.NONE, row.getEscalatedBy());
    }

    private AuditLog savedAuditFor(UUID requestId) {
        ArgumentCaptor<AuditLog> captor = ArgumentCaptor.forClass(AuditLog.class);
        verify(auditRepositoryMock, org.mockito.Mockito.atLeastOnce()).save(captor.capture());
        return captor.getAllValues().stream()
                .filter(row -> requestId.equals(row.getRequestId()))
                .findFirst()
                .orElseThrow(() -> new AssertionError("no audit row saved for requestId " + requestId));
    }

    private void assertErrorLoggedFor(UUID requestId, String fragment) {
        boolean logged = logEvents.list.stream().anyMatch(event -> event.getLevel() == Level.ERROR
                && event.getFormattedMessage().contains(fragment)
                && event.getFormattedMessage().contains(requestId.toString()));
        assertTrue(logged, "expected an ERROR log containing '" + fragment + "' and requestId " + requestId);
    }
}
