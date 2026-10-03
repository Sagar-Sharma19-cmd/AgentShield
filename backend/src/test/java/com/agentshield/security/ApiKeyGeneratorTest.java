package com.agentshield.security;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.HashSet;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class ApiKeyGeneratorTest {

    private final ApiKeyGenerator generator = new ApiKeyGenerator();

    @Test
    @DisplayName("Generated keys have the agk_live_ + 32 base62 format")
    void testFormat() {
        String key = generator.generate();

        assertTrue(key.matches("^agk_live_[A-Za-z0-9]{32}$"), key);
        assertTrue(ApiKeyGenerator.hasValidFormat(key));
        assertEquals(key.substring(0, 13), ApiKeyGenerator.displayPrefix(key));
    }

    @Test
    @DisplayName("Generated keys are unique")
    void testUniqueness() {
        Set<String> keys = new HashSet<>();
        for (int i = 0; i < 1000; i++) {
            keys.add(generator.generate());
        }
        assertEquals(1000, keys.size());
    }

    @Test
    @DisplayName("Malformed keys are rejected by the format check")
    void testInvalidFormats() {
        assertFalse(ApiKeyGenerator.hasValidFormat(null));
        assertFalse(ApiKeyGenerator.hasValidFormat(""));
        assertFalse(ApiKeyGenerator.hasValidFormat("agk_live_short"));
        assertFalse(ApiKeyGenerator.hasValidFormat("agk_test_" + "a".repeat(32)));
        assertFalse(ApiKeyGenerator.hasValidFormat("agk_live_" + "a".repeat(31) + "!"));
        assertFalse(ApiKeyGenerator.hasValidFormat("agk_live_" + "a".repeat(33)));
    }
}
