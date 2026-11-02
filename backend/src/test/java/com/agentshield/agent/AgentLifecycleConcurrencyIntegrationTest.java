package com.agentshield.agent;

import com.agentshield.dto.AgentCreateRequest;
import com.agentshield.dto.AgentCreateResponse;
import com.agentshield.exception.ConflictException;
import com.agentshield.model.AgentStatus;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * PostgreSQL checks for concurrent lifecycle writes on one agent.
 *
 * <p><b>What runs:</b> the class is skipped unless AGENTSHIELD_PG_TEST_URL is set. When it is set, a
 * {@code @BeforeAll} guard refuses any URL whose database name does not end in {@code _test} before
 * Spring or Flyway connect. Credentials come only from AGENTSHIELD_PG_TEST_USER and
 * AGENTSHIELD_PG_TEST_PASSWORD. Use a disposable database: the tests create agents and change them.
 *
 * <p><b>What the tests prove:</b>
 * <ul>
 *   <li>{@link #rotationBlocksOnARowLockHeldByAnotherTransaction()} and
 *       {@link #rotationWaitingOnACommittedRevocationIsRejected()} are deterministic. A transaction the
 *       test controls holds the agent's row lock. The test waits until PostgreSQL reports the rotation
 *       session as waiting on a lock (pg_stat_activity), so the blocking is observed, not assumed. It
 *       then releases the lock. Polling stops as soon as the condition holds, with a 15-second bound.</li>
 *   <li>The randomized race tests run many interleavings and check the final-state invariants and that
 *       every outcome is one the lifecycle rules allow. They do not force an interleaving, so they can
 *       pass without the operations ever overlapping. The interval overlap count is printed as evidence
 *       only and is not asserted.</li>
 * </ul>
 *
 * <p><b>Lock strength:</b> PESSIMISTIC_WRITE is emitted as {@code FOR NO KEY UPDATE} on PostgreSQL. It is
 * the row lock that conflicts with the other lifecycle writers, so serialization does not depend on
 * {@code FOR UPDATE} specifically.
 *
 * <p><b>Isolation assumption:</b> the locking relies on PostgreSQL READ COMMITTED, the server and JDBC
 * default. The first deterministic test asserts this on its own connection. The application does not set
 * isolation globally.
 */
@SpringBootTest(properties = {
        "spring.datasource.url=${AGENTSHIELD_PG_TEST_URL}",
        "spring.datasource.username=${AGENTSHIELD_PG_TEST_USER:}",
        "spring.datasource.password=${AGENTSHIELD_PG_TEST_PASSWORD:}",
        "spring.datasource.driver-class-name=org.postgresql.Driver",
        "spring.jpa.database-platform=org.hibernate.dialect.PostgreSQLDialect",
        "spring.jpa.properties.hibernate.dialect=org.hibernate.dialect.PostgreSQLDialect"
})
@ActiveProfiles("test")
@EnabledIfEnvironmentVariable(named = "AGENTSHIELD_PG_TEST_URL", matches = ".+")
class AgentLifecycleConcurrencyIntegrationTest {

    /** Races per scenario. Enough to make a stale overwrite likely without slowing the suite. */
    private static final int ROUNDS = 25;

    /** Exact rule message for rotating a revoked agent (AgentService.rotateApiKey). */
    private static final String ROTATE_AFTER_REVOCATION = "A revoked agent cannot be issued a new API key.";

    /**
     * The statement a waiting session is blocked on. Hibernate emits {@code for no key update} for
     * PESSIMISTIC_WRITE on PostgreSQL. That lock conflicts with FOR UPDATE, FOR NO KEY UPDATE and plain
     * UPDATE, which are the only writers of agent rows, so both spellings are accepted here.
     */
    private static final String ROW_LOCK_LOOKUP = "(?is).*\\bfrom agents\\b.*\\bfor (no key )?update\\b.*";

    private static final long LOCK_WAIT_TIMEOUT_MS = 15_000;
    private static final long OPERATION_TIMEOUT_SECONDS = 30;

    @Autowired
    private AgentService agentService;

    @Autowired
    private AgentRepository agentRepository;

    @Autowired
    private DataSource dataSource;

    /** Runs before the Spring context starts, so an unsafe URL never reaches Flyway or the database. */
    @BeforeAll
    static void refuseUnsafeDatabase() {
        PostgresTestDatabaseGuard.requireDisposableTestDatabase(System.getenv("AGENTSHIELD_PG_TEST_URL"));
    }

    /** One operation's result: the conflict message if the lifecycle rules rejected it, plus its time span. */
    private record Attempt(String conflictMessage, long startNanos, long endNanos) {
        boolean conflicted() {
            return conflictMessage != null;
        }
    }

    /** Two operations started together. The first and second are named by each caller. */
    private record Race(Attempt first, Attempt second) {
        boolean overlapped() {
            return first.startNanos() < second.endNanos() && second.startNanos() < first.endNanos();
        }
    }

    @Test
    void revokeAndRotateRaceOnlyProducesOutcomesTheRulesAllow() throws Exception {
        int rotateCompletedFirst = 0;
        int rotateRejectedAfterRevoke = 0;
        int overlapping = 0;

        for (int round = 0; round < ROUNDS; round++) {
            UUID id = register();
            Race race = race(() -> agentService.updateStatus(id, AgentStatus.REVOKED),
                    () -> agentService.rotateApiKey(id));

            // Revocation is never rejected: REVOKED to REVOKED is allowed, and no other state blocks it.
            assertThat(race.first().conflictMessage())
                    .as("round %d: revoke must always complete", round)
                    .isNull();

            // Rotation either ran before the revoke committed, or after it and was rejected with the
            // revoked rule. Any other rejection is an invalid outcome.
            if (race.second().conflicted()) {
                assertThat(race.second().conflictMessage())
                        .as("round %d: rotation rejected for an unexpected reason", round)
                        .isEqualTo(ROTATE_AFTER_REVOCATION);
                rotateRejectedAfterRevoke++;
            } else {
                rotateCompletedFirst++;
            }
            if (race.overlapped()) {
                overlapping++;
            }

            Agent agent = agentRepository.findById(id).orElseThrow();
            assertThat(agent.getStatus())
                    .as("round %d: revoke must not be overwritten by a concurrent rotation", round)
                    .isEqualTo(AgentStatus.REVOKED);
            assertThat(agent.hasApiKey())
                    .as("round %d: a revoked agent must hold no usable key", round)
                    .isFalse();
        }
        System.out.printf("[concurrency] revoke/rotate: %d rounds, rotate-before-revoke=%d, "
                + "rotate-rejected-after-revoke=%d, overlapping-intervals=%d%n",
                ROUNDS, rotateCompletedFirst, rotateRejectedAfterRevoke, overlapping);
    }

    @Test
    void suspendAndRotateRaceKeepsTheSuspensionAndCompletesBothOperations() throws Exception {
        int overlapping = 0;

        for (int round = 0; round < ROUNDS; round++) {
            UUID id = register();
            Race race = race(() -> agentService.updateStatus(id, AgentStatus.SUSPENDED),
                    () -> agentService.rotateApiKey(id));

            // Neither operation is rejected by the rules: suspension is allowed from ACTIVE and rotation
            // is allowed for SUSPENDED agents.
            assertThat(race.first().conflicted()).as("round %d: suspend must complete", round).isFalse();
            assertThat(race.second().conflicted()).as("round %d: rotate must complete", round).isFalse();
            if (race.overlapped()) {
                overlapping++;
            }

            Agent agent = agentRepository.findById(id).orElseThrow();
            assertThat(agent.getStatus())
                    .as("round %d: a rotation must not reactivate or undo a suspension", round)
                    .isEqualTo(AgentStatus.SUSPENDED);
            assertThat(agent.hasApiKey())
                    .as("round %d: rotation must have issued a key", round)
                    .isTrue();
        }
        System.out.printf("[concurrency] suspend/rotate: %d rounds, overlapping-intervals=%d%n",
                ROUNDS, overlapping);
    }

    /**
     * Deterministic. The test's own transaction holds the agent's row lock, so the rotation must wait.
     * The wait is observed in pg_stat_activity before the lock is released. Then the rotation completes
     * with a new key. Also asserts the isolation level the locking depends on.
     */
    @Test
    void rotationBlocksOnARowLockHeldByAnotherTransaction() throws Exception {
        UUID id = register();

        try (Connection holder = dataSource.getConnection()) {
            holder.setAutoCommit(false);
            assertThat(holder.getTransactionIsolation())
                    .as("the row-lock behaviour assumes PostgreSQL READ COMMITTED")
                    .isEqualTo(Connection.TRANSACTION_READ_COMMITTED);
            lockAgentRow(holder, id);

            ExecutorService pool = Executors.newSingleThreadExecutor();
            try {
                Future<AgentCreateResponse> rotation = pool.submit(() -> agentService.rotateApiKey(id));
                String waitingStatement = awaitLockWait(rotation);
                assertThat(waitingStatement)
                        .as("the waiting statement must be the row-locking lookup, not a later write")
                        .matches(ROW_LOCK_LOOKUP);

                holder.commit();
                AgentCreateResponse response = rotation.get(OPERATION_TIMEOUT_SECONDS, TimeUnit.SECONDS);
                assertThat(response.apiKey()).isNotBlank();
            } finally {
                pool.shutdownNow();
                holder.rollback(); // no-op after a successful commit; releases the lock if the test failed first
            }
        }

        Agent agent = agentRepository.findById(id).orElseThrow();
        assertThat(agent.getStatus()).isEqualTo(AgentStatus.ACTIVE);
        assertThat(agent.hasApiKey()).isTrue();
    }

    /**
     * Deterministic. While the rotation waits on the lock, the holder commits a revocation. The rotation
     * must then see REVOKED and be rejected with the revoked rule. Without a lock it would have read the
     * agent before the revocation and issued a key.
     */
    @Test
    void rotationWaitingOnACommittedRevocationIsRejected() throws Exception {
        UUID id = register();

        try (Connection holder = dataSource.getConnection()) {
            holder.setAutoCommit(false);
            lockAgentRow(holder, id);

            ExecutorService pool = Executors.newSingleThreadExecutor();
            try {
                Future<AgentCreateResponse> rotation = pool.submit(() -> agentService.rotateApiKey(id));
                String waitingStatement = awaitLockWait(rotation);
                assertThat(waitingStatement)
                        .as("the waiting statement must be the row-locking lookup, not a later write")
                        .matches(ROW_LOCK_LOOKUP);

                // Mirrors the columns that AgentService.updateStatus(REVOKED) writes.
                try (PreparedStatement revoke = holder.prepareStatement(
                        "update agents set status = 'REVOKED', api_key_hash = null, api_key_prefix = null "
                                + "where id = ?")) {
                    revoke.setObject(1, id);
                    assertThat(revoke.executeUpdate()).isEqualTo(1);
                }
                holder.commit();

                assertThatRotationRejectedAfterRevocation(rotation);
            } finally {
                pool.shutdownNow();
                holder.rollback();
            }
        }

        Agent agent = agentRepository.findById(id).orElseThrow();
        assertThat(agent.getStatus()).isEqualTo(AgentStatus.REVOKED);
        assertThat(agent.hasApiKey()).isFalse();
    }

    private void assertThatRotationRejectedAfterRevocation(Future<AgentCreateResponse> rotation) throws Exception {
        try {
            AgentCreateResponse response = rotation.get(OPERATION_TIMEOUT_SECONDS, TimeUnit.SECONDS);
            throw new AssertionError("rotation issued a key for a revoked agent: prefix " + response.apiKeyPrefix());
        } catch (java.util.concurrent.ExecutionException failure) {
            assertThat(failure.getCause()).isInstanceOf(ConflictException.class);
            assertThat(failure.getCause().getMessage()).isEqualTo(ROTATE_AFTER_REVOCATION);
        }
    }

    private void lockAgentRow(Connection holder, UUID id) throws Exception {
        try (PreparedStatement lock = holder.prepareStatement("select id from agents where id = ? for update")) {
            lock.setObject(1, id);
            try (ResultSet rs = lock.executeQuery()) {
                assertThat(rs.next()).as("holder must lock the agent row").isTrue();
            }
        }
    }

    /**
     * Polls pg_stat_activity until a session in this database is waiting on a lock, and returns the SQL
     * that session is blocked on. Returns as soon as that is observed. If the operation finishes first,
     * the test fails: the operation did not block.
     */
    private String awaitLockWait(Future<?> operation) throws Exception {
        long deadline = System.nanoTime() + TimeUnit.MILLISECONDS.toNanos(LOCK_WAIT_TIMEOUT_MS);
        try (Connection monitor = dataSource.getConnection();
             PreparedStatement waiting = monitor.prepareStatement(
                     "select query from pg_stat_activity "
                             + "where datname = current_database() and wait_event_type = 'Lock' "
                             + "and pid <> pg_backend_pid() limit 1")) {
            while (System.nanoTime() < deadline) {
                if (operation.isDone()) {
                    operation.get(); // surfaces an exception from the operation, if any
                    throw new AssertionError("operation finished without waiting for the row lock");
                }
                try (ResultSet rs = waiting.executeQuery()) {
                    if (rs.next()) {
                        return rs.getString(1);
                    }
                }
                Thread.sleep(10);
            }
        }
        throw new AssertionError("no session waited on a lock within " + LOCK_WAIT_TIMEOUT_MS + " ms");
    }

    private UUID register() {
        String name = "race-" + UUID.randomUUID().toString().substring(0, 12);
        return agentService.registerAgent(new AgentCreateRequest(name, "concurrency check")).id();
    }

    /**
     * Starts both operations behind one latch so they are released together. Each records its start and
     * end time. Conflicts are captured with their message. Any other exception fails the test via get().
     */
    private static Race race(Callable<?> first, Callable<?> second) throws Exception {
        ExecutorService pool = Executors.newFixedThreadPool(2);
        try {
            CountDownLatch start = new CountDownLatch(1);
            Future<Attempt> a = pool.submit(() -> attempt(start, first));
            Future<Attempt> b = pool.submit(() -> attempt(start, second));
            start.countDown();
            return new Race(a.get(OPERATION_TIMEOUT_SECONDS, TimeUnit.SECONDS),
                    b.get(OPERATION_TIMEOUT_SECONDS, TimeUnit.SECONDS));
        } finally {
            pool.shutdownNow();
        }
    }

    private static Attempt attempt(CountDownLatch start, Callable<?> operation) throws Exception {
        start.await();
        long began = System.nanoTime();
        try {
            operation.call();
            return new Attempt(null, began, System.nanoTime());
        } catch (ConflictException conflict) {
            return new Attempt(conflict.getMessage(), began, System.nanoTime());
        }
    }
}
