package com.agentshield.enforcement;

import com.agentshield.exception.InvalidDecisionTokenException;
import com.agentshield.model.ActionType;
import com.nimbusds.jose.JOSEException;
import com.nimbusds.jose.JOSEObjectType;
import com.nimbusds.jose.JWSAlgorithm;
import com.nimbusds.jose.JWSHeader;
import com.nimbusds.jose.crypto.MACSigner;
import com.nimbusds.jose.crypto.MACVerifier;
import com.nimbusds.jwt.JWTClaimsSet;
import com.nimbusds.jwt.SignedJWT;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.text.ParseException;
import java.time.Clock;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Date;
import java.util.HexFormat;
import java.util.UUID;

/**
 * Issues and verifies one-time decision tokens: compact HS256 JWTs signed with
 * {@code agentshield.decision-token.secret} (AGENTSHIELD_DECISION_TOKEN_SECRET, required, at least 32 characters).
 *
 * Claims: jti = gateway requestId, sub = verified registered agent id, tool, action, res = SHA-256 hex of the
 * resource, src = ALLOW or REVIEW_APPROVED, iat, exp (iat + ttl-seconds, default 60), and (Phase V13, only when
 * the request had arguments) args = SHA-256 hex of the canonical JSON of the arguments.
 *
 * A token proves that AgentShield decided this exact operation for this agent, recently. Being one-time is not
 * the token's job: redemption records the jti once (DecisionRedemptionService). Tokens and the secret are never
 * logged, and no exception message contains either.
 */
@Component
public class DecisionTokenService {

    static final int MIN_SECRET_LENGTH = 32;
    static final String CLAIM_TOOL = "tool";
    static final String CLAIM_ACTION = "action";
    static final String CLAIM_RESOURCE_HASH = "res";
    static final String CLAIM_SOURCE = "src";
    static final String CLAIM_ARGS = "args";

    private final MACSigner signer;
    private final MACVerifier verifier;
    private final long ttlSeconds;
    private final Clock clock;

    public DecisionTokenService(@Value("${agentshield.decision-token.secret:}") String secret,
                                @Value("${agentshield.decision-token.ttl-seconds:60}") long ttlSeconds,
                                Clock clock) {
        if (secret == null || secret.isBlank() || secret.length() < MIN_SECRET_LENGTH) {
            // Never include the configured value in the message
            throw new IllegalStateException("agentshield.decision-token.secret must be set to at least "
                    + MIN_SECRET_LENGTH + " characters (environment variable AGENTSHIELD_DECISION_TOKEN_SECRET).");
        }
        if (ttlSeconds <= 0) {
            throw new IllegalStateException("agentshield.decision-token.ttl-seconds must be positive.");
        }
        byte[] key = secret.getBytes(StandardCharsets.UTF_8);
        try {
            this.signer = new MACSigner(key);
            this.verifier = new MACVerifier(key);
        } catch (JOSEException e) {
            throw new IllegalStateException("agentshield.decision-token.secret is not a usable HS256 key.");
        }
        this.ttlSeconds = ttlSeconds;
        this.clock = clock;
    }

    public long ttlSeconds() {
        return ttlSeconds;
    }

    /** Signs a token for one decided operation without arguments. */
    public String issue(UUID requestId, UUID agentId, String tool, ActionType action, String resource,
                        DecisionSource source) {
        return issue(requestId, agentId, tool, action, resource, source, null);
    }

    /**
     * Signs a token for one decided operation.
     *
     * @param argsHash SHA-256 hex of the canonical arguments the decision was made with, or null for none. When
     *                 present it is signed as the "args" claim, and the redeem must present the same arguments.
     */
    public String issue(UUID requestId, UUID agentId, String tool, ActionType action, String resource,
                        DecisionSource source, String argsHash) {
        if (requestId == null || agentId == null || tool == null || action == null || resource == null || source == null) {
            throw new IllegalArgumentException("A decision token needs a request, a verified agent and an operation.");
        }
        // JWT dates have second precision; truncate so exp is exactly iat + ttl.
        Instant issuedAt = clock.instant().truncatedTo(ChronoUnit.SECONDS);
        JWTClaimsSet.Builder builder = new JWTClaimsSet.Builder()
                .jwtID(requestId.toString())
                .subject(agentId.toString())
                .claim(CLAIM_TOOL, tool)
                .claim(CLAIM_ACTION, action.name())
                .claim(CLAIM_RESOURCE_HASH, sha256Hex(resource))
                .claim(CLAIM_SOURCE, source.name())
                .issueTime(Date.from(issuedAt))
                .expirationTime(Date.from(issuedAt.plusSeconds(ttlSeconds)));
        if (argsHash != null) {
            builder.claim(CLAIM_ARGS, argsHash);
        }
        JWTClaimsSet claims = builder.build();
        SignedJWT jwt = new SignedJWT(new JWSHeader.Builder(JWSAlgorithm.HS256).type(JOSEObjectType.JWT).build(), claims);
        try {
            jwt.sign(signer);
        } catch (JOSEException e) {
            throw new IllegalStateException("Could not sign the decision token.");
        }
        return jwt.serialize();
    }

    /**
     * Verifies the signature (HS256 only), the required claims and the expiry against the application clock.
     *
     * @throws InvalidDecisionTokenException for anything that is not a valid, unexpired token
     */
    public DecisionTokenClaims verify(String token) {
        SignedJWT jwt;
        try {
            jwt = SignedJWT.parse(token);
        } catch (ParseException | RuntimeException e) {
            throw invalid();
        }
        // Only HS256 is accepted: never "none", never another algorithm named by the token itself.
        if (!JWSAlgorithm.HS256.equals(jwt.getHeader().getAlgorithm())) {
            throw invalid();
        }
        try {
            if (!jwt.verify(verifier)) {
                throw invalid();
            }
        } catch (JOSEException e) {
            throw invalid();
        }

        DecisionTokenClaims claims;
        try {
            JWTClaimsSet set = jwt.getJWTClaimsSet();
            claims = new DecisionTokenClaims(
                    UUID.fromString(required(set.getJWTID())),
                    UUID.fromString(required(set.getSubject())),
                    required(set.getStringClaim(CLAIM_TOOL)),
                    ActionType.valueOf(required(set.getStringClaim(CLAIM_ACTION))),
                    required(set.getStringClaim(CLAIM_RESOURCE_HASH)),
                    DecisionSource.valueOf(required(set.getStringClaim(CLAIM_SOURCE))),
                    required(set.getIssueTime()).toInstant(),
                    required(set.getExpirationTime()).toInstant(),
                    set.getStringClaim(CLAIM_ARGS));
        } catch (ParseException | RuntimeException e) {
            throw invalid();
        }
        if (!clock.instant().isBefore(claims.expiresAt())) {
            throw new InvalidDecisionTokenException("The decision token has expired. Evaluate the request again.");
        }
        return claims;
    }

    /** Lowercase hex SHA-256 of the UTF-8 resource string (64 characters). */
    public static String sha256Hex(String value) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            return HexFormat.of().formatHex(digest.digest(value.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 is unavailable", e);
        }
    }

    private static <T> T required(T value) {
        if (value == null) {
            throw new IllegalArgumentException("missing claim");
        }
        return value;
    }

    private static InvalidDecisionTokenException invalid() {
        return new InvalidDecisionTokenException("The decision token is not valid.");
    }
}
