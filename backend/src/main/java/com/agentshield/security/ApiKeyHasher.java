package com.agentshield.security;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.util.HexFormat;

/**
 * Hashes agent API keys with HMAC-SHA256 keyed by a server-side pepper.
 *
 * Why HMAC instead of BCrypt/Argon2 or a per-row salt: API keys are 190-bit random values,
 * so slow password hashing adds nothing, while a deterministic keyed hash allows an indexed
 * lookup by hash. The pepper lives outside the database, so a leaked database alone does not
 * allow candidate keys to be verified offline.
 */
@Component
public class ApiKeyHasher {

    private static final String ALGORITHM = "HmacSHA256";
    static final int MIN_PEPPER_LENGTH = 32;

    private final SecretKeySpec pepperKey;

    public ApiKeyHasher(@Value("${agentshield.security.api-key-pepper:}") String pepper) {
        if (pepper == null || pepper.isBlank() || pepper.length() < MIN_PEPPER_LENGTH) {
            // Never include the configured value in the message
            throw new IllegalStateException("agentshield.security.api-key-pepper must be set to at least "
                    + MIN_PEPPER_LENGTH + " characters (environment variable AGENTSHIELD_API_KEY_PEPPER).");
        }
        this.pepperKey = new SecretKeySpec(pepper.getBytes(StandardCharsets.UTF_8), ALGORITHM);
    }

    /**
     * @return lowercase hex HMAC-SHA256 of the raw key (64 characters)
     */
    public String hash(String rawKey) {
        try {
            Mac mac = Mac.getInstance(ALGORITHM);
            mac.init(pepperKey);
            return HexFormat.of().formatHex(mac.doFinal(rawKey.getBytes(StandardCharsets.UTF_8)));
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException("HmacSHA256 is unavailable", e);
        }
    }
}
