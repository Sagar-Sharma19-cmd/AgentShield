package com.agentshield.security;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class ApiKeyHasherTest {

    private static final String PEPPER_A = "unit-test-pepper-a-000000000000000000";
    private static final String PEPPER_B = "unit-test-pepper-b-000000000000000000";
    private static final String KEY = "agk_live_" + "x".repeat(32);

    @Test
    @DisplayName("Hash is deterministic, 64 hex chars and never equals the key")
    void testDeterministicHexHash() {
        ApiKeyHasher hasher = new ApiKeyHasher(PEPPER_A);

        String hash = hasher.hash(KEY);

        assertEquals(hash, hasher.hash(KEY));
        assertTrue(hash.matches("^[0-9a-f]{64}$"));
        assertFalse(hash.contains(KEY.substring(9)));
    }

    @Test
    @DisplayName("Hash depends on the server-side pepper")
    void testPepperChangesHash() {
        assertNotEquals(new ApiKeyHasher(PEPPER_A).hash(KEY), new ApiKeyHasher(PEPPER_B).hash(KEY));
    }

    @Test
    @DisplayName("Missing or short pepper fails fast without echoing the value")
    void testPepperValidation() {
        assertThrows(IllegalStateException.class, () -> new ApiKeyHasher(null));
        assertThrows(IllegalStateException.class, () -> new ApiKeyHasher(""));
        IllegalStateException ex = assertThrows(IllegalStateException.class, () -> new ApiKeyHasher("too-short-pepper"));
        assertFalse(ex.getMessage().contains("too-short-pepper"));
    }
}
