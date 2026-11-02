package com.agentshield.agent;

import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Refuses to run PostgreSQL integration tests against anything other than a disposable test database.
 *
 * The rule is deliberately narrow: the JDBC URL must be jdbc:postgresql://host[:port]/NAME where NAME
 * ends in "_test", and the URL must not carry a query parameter that could select a different database.
 * Failure messages never include the URL, the host, or any credential.
 */
final class PostgresTestDatabaseGuard {

    static final String REQUIRED_SUFFIX = "_test";

    private static final Pattern POSTGRES_URL =
            Pattern.compile("^jdbc:postgresql://[^/?#]+/([^/?#]+)(\\?[^#]*)?$");

    private PostgresTestDatabaseGuard() {
    }

    /** Throws IllegalStateException unless the URL names a disposable test database. */
    static void requireDisposableTestDatabase(String jdbcUrl) {
        if (jdbcUrl == null || jdbcUrl.isBlank()) {
            throw refuse("AGENTSHIELD_PG_TEST_URL is empty.");
        }
        Matcher matcher = POSTGRES_URL.matcher(jdbcUrl.trim());
        if (!matcher.matches()) {
            throw refuse("AGENTSHIELD_PG_TEST_URL must be a jdbc:postgresql:// URL with a database name.");
        }
        String databaseName = matcher.group(1);
        String query = matcher.group(2) == null ? "" : matcher.group(2).toLowerCase(Locale.ROOT);
        if (!databaseName.endsWith(REQUIRED_SUFFIX)) {
            throw refuse("AGENTSHIELD_PG_TEST_URL must name a database whose name ends in '"
                    + REQUIRED_SUFFIX + "'. Refusing to run concurrency tests against any other database.");
        }
        if (query.contains("dbname=") || query.contains("pgdbname=")) {
            throw refuse("AGENTSHIELD_PG_TEST_URL must not override the database name with a query parameter.");
        }
    }

    private static IllegalStateException refuse(String reason) {
        return new IllegalStateException("PostgreSQL concurrency tests refused to start. " + reason);
    }
}
