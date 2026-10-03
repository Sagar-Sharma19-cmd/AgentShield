package com.agentshield.security;

import org.springframework.stereotype.Component;

import java.security.SecureRandom;

/**
 * Generates agent API keys of the form {@code agk_live_<32 base62 chars>} (~190 bits of entropy).
 */
@Component
public class ApiKeyGenerator {

    public static final String KEY_PREFIX = "agk_live_";
    static final int RANDOM_PART_LENGTH = 32;
    /** Number of random characters kept in the non-secret display prefix. */
    private static final int DISPLAY_CHARS = 4;
    private static final char[] ALPHABET =
            "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789".toCharArray();

    private final SecureRandom secureRandom = new SecureRandom();

    public String generate() {
        StringBuilder key = new StringBuilder(KEY_PREFIX.length() + RANDOM_PART_LENGTH).append(KEY_PREFIX);
        for (int i = 0; i < RANDOM_PART_LENGTH; i++) {
            key.append(ALPHABET[secureRandom.nextInt(ALPHABET.length)]);
        }
        return key.toString();
    }

    /**
     * Cheap structural check so malformed keys are rejected without a database lookup.
     */
    public static boolean hasValidFormat(String key) {
        if (key == null || key.length() != KEY_PREFIX.length() + RANDOM_PART_LENGTH || !key.startsWith(KEY_PREFIX)) {
            return false;
        }
        for (int i = KEY_PREFIX.length(); i < key.length(); i++) {
            char c = key.charAt(i);
            if (!((c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z') || (c >= '0' && c <= '9'))) {
                return false;
            }
        }
        return true;
    }

    /**
     * Non-secret prefix used to identify a key in responses, e.g. {@code agk_live_abcd}.
     */
    public static String displayPrefix(String key) {
        return key.substring(0, KEY_PREFIX.length() + DISPLAY_CHARS);
    }
}
