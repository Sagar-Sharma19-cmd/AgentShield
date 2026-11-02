package com.agentshield.agent;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** Pure unit tests for the database guard. No database is contacted. */
class PostgresTestDatabaseGuardTest {

    @ParameterizedTest
    @ValueSource(strings = {
            "jdbc:postgresql://127.0.0.1:55500/agentshield_test",
            "jdbc:postgresql://db.internal:5432/concurrency_test",
            "jdbc:postgresql://localhost/x_test?sslmode=disable",
            "  jdbc:postgresql://127.0.0.1:55500/agentshield_test  "
    })
    void acceptsUrlsThatNameADatabaseEndingInTest(String url) {
        assertThatCode(() -> PostgresTestDatabaseGuard.requireDisposableTestDatabase(url))
                .doesNotThrowAnyException();
    }

    @ParameterizedTest
    @ValueSource(strings = {
            "jdbc:postgresql://127.0.0.1:5434/agentshield",
            "jdbc:postgresql://127.0.0.1:5432/postgres",
            "jdbc:postgresql://127.0.0.1:55500/agentshield_test_prod",
            "jdbc:postgresql://127.0.0.1:55500/agentshield_testing",
            "jdbc:postgresql://127.0.0.1:55500/agentshield_test?dbname=agentshield",
            "jdbc:postgresql://127.0.0.1:55500/agentshield_test?PGDBNAME=agentshield",
            "jdbc:postgresql://127.0.0.1:55500/",
            "jdbc:postgresql://127.0.0.1:55500"
    })
    void refusesAnyOtherDatabase(String url) {
        assertThatThrownBy(() -> PostgresTestDatabaseGuard.requireDisposableTestDatabase(url))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("refused to start");
    }

    @Test
    void refusesNonPostgresUrls() {
        assertThatThrownBy(() -> PostgresTestDatabaseGuard.requireDisposableTestDatabase(
                "jdbc:h2:mem:agentshield_test"))
                .isInstanceOf(IllegalStateException.class);
    }

    @Test
    void refusesMissingUrl() {
        assertThatThrownBy(() -> PostgresTestDatabaseGuard.requireDisposableTestDatabase(null))
                .isInstanceOf(IllegalStateException.class);
        assertThatThrownBy(() -> PostgresTestDatabaseGuard.requireDisposableTestDatabase("   "))
                .isInstanceOf(IllegalStateException.class);
    }

    @Test
    void failureMessageDoesNotEchoTheUrlHostOrCredentials() {
        String url = "postgresql-user:s3cret-value@prod-db.example.internal:5432/agentshield";

        assertThatThrownBy(() -> PostgresTestDatabaseGuard.requireDisposableTestDatabase("jdbc:postgresql://" + url))
                .isInstanceOf(IllegalStateException.class)
                .satisfies(error -> {
                    String message = error.getMessage();
                    org.assertj.core.api.Assertions.assertThat(message)
                            .doesNotContain("s3cret-value")
                            .doesNotContain("prod-db.example.internal")
                            .doesNotContain("agentshield")
                            .doesNotContain("jdbc:");
                });
    }
}
