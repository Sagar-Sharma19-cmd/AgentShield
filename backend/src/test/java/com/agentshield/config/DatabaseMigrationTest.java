package com.agentshield.config;

import org.flywaydb.core.Flyway;
import org.flywaydb.core.api.MigrationInfo;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

import java.util.Arrays;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * The schema is created only by Flyway, and Hibernate (ddl-auto=validate) accepts it —
 * this context starting at all proves entities and migrations agree.
 */
@SpringBootTest
@ActiveProfiles("test")
class DatabaseMigrationTest {

    @Autowired
    private Flyway flyway;

    @Test
    @DisplayName("All versioned migrations are applied successfully and none are pending")
    void testMigrationsApplied() {
        List<String> applied = Arrays.stream(flyway.info().applied())
                .filter(MigrationInfo::isVersioned)
                .map(info -> info.getVersion().getVersion())
                .toList();

        assertEquals(List.of("1", "2", "3", "4"), applied);
        assertTrue(Arrays.stream(flyway.info().applied()).allMatch(info -> info.getState().isApplied()));
        assertEquals(0, flyway.info().pending().length);
    }
}
