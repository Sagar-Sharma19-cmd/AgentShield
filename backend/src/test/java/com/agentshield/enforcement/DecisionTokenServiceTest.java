package com.agentshield.enforcement;

import com.agentshield.config.MutableClock;
import com.agentshield.exception.InvalidDecisionTokenException;
import com.agentshield.model.ActionType;
import com.nimbusds.jose.JWSAlgorithm;
import com.nimbusds.jose.JWSHeader;
import com.nimbusds.jose.crypto.MACSigner;
import com.nimbusds.jwt.JWTClaimsSet;
import com.nimbusds.jwt.SignedJWT;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.Date;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/** Unit tests for DecisionTokenService: issuing, verifying, expiry and rejection of forged tokens. */
class DecisionTokenServiceTest {

    private static final String SECRET = "unit-test-decision-secret-not-a-secret-0123456789";
    private static final Instant START = Instant.parse("2026-11-11T10:00:00Z");

    private final MutableClock clock = new MutableClock(START);
    private final DecisionTokenService service = new DecisionTokenService(SECRET, 60, clock);

    @Test
    @DisplayName("Startup refuses a missing or short secret, and never echoes it")
    void requiresSecret() {
        for (String bad : new String[] {null, "", "   ", "short-secret-31-characters-long"}) {
            IllegalStateException error = assertThrows(IllegalStateException.class,
                    () -> new DecisionTokenService(bad, 60, clock));
            assertTrue(error.getMessage().contains("AGENTSHIELD_DECISION_TOKEN_SECRET"));
            if (bad != null && !bad.isBlank()) {
                assertFalse(error.getMessage().contains(bad));
            }
        }
        assertThrows(IllegalStateException.class, () -> new DecisionTokenService(SECRET, 0, clock));
    }

    @Test
    @DisplayName("A token carries the required claims, HS256, a hashed resource and exp = iat + ttl")
    void claims() throws Exception {
        UUID requestId = UUID.randomUUID();
        UUID agentId = UUID.randomUUID();
        String token = service.issue(requestId, agentId, "docker", ActionType.WRITE, "image:demo", DecisionSource.ALLOW);

        SignedJWT jwt = SignedJWT.parse(token);
        assertEquals(JWSAlgorithm.HS256, jwt.getHeader().getAlgorithm());
        JWTClaimsSet set = jwt.getJWTClaimsSet();
        assertEquals(requestId.toString(), set.getJWTID());
        assertEquals(agentId.toString(), set.getSubject());
        assertEquals("docker", set.getStringClaim("tool"));
        assertEquals("WRITE", set.getStringClaim("action"));
        assertEquals(DecisionTokenService.sha256Hex("image:demo"), set.getStringClaim("res"));
        assertEquals(64, set.getStringClaim("res").length());
        assertEquals("ALLOW", set.getStringClaim("src"));
        assertEquals(START, set.getIssueTime().toInstant());
        assertEquals(START.plusSeconds(60), set.getExpirationTime().toInstant());
        assertFalse(token.contains("image:demo"), "the raw resource is never in the token");
        String payload = new String(Base64.getUrlDecoder().decode(token.split("\\.")[1]), StandardCharsets.UTF_8);
        assertFalse(payload.contains("image:demo"));

        DecisionTokenClaims verified = service.verify(token);
        assertEquals(requestId, verified.requestId());
        assertEquals(agentId, verified.agentId());
        assertEquals(ActionType.WRITE, verified.action());
        assertEquals(DecisionSource.ALLOW, verified.source());
    }

    @Test
    @DisplayName("sha256Hex is the standard SHA-256")
    void sha256() {
        assertEquals("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855", DecisionTokenService.sha256Hex(""));
        assertEquals("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad", DecisionTokenService.sha256Hex("abc"));
    }

    @Test
    @DisplayName("Valid until exp, invalid at and after it")
    void expiry() {
        String token = service.issue(UUID.randomUUID(), UUID.randomUUID(), "t", ActionType.READ, "r", DecisionSource.ALLOW);
        clock.advance(Duration.ofSeconds(59));
        service.verify(token);
        clock.advance(Duration.ofSeconds(1));
        InvalidDecisionTokenException expired = assertThrows(InvalidDecisionTokenException.class, () -> service.verify(token));
        assertTrue(expired.getMessage().contains("expired"));
    }

    @Test
    @DisplayName("Tampered, re-signed with another key, alg none and garbage are all rejected without echoing the token")
    void rejectsForgeries() throws Exception {
        UUID agent = UUID.randomUUID();
        String token = service.issue(UUID.randomUUID(), agent, "t", ActionType.READ, "r", DecisionSource.ALLOW);
        String[] parts = token.split("\\.");

        // Payload swapped for one naming a different action, signature kept.
        JWTClaimsSet forgedClaims = new JWTClaimsSet.Builder(SignedJWT.parse(token).getJWTClaimsSet()).claim("action", "DELETE").build();
        String forgedPayload = Base64.getUrlEncoder().withoutPadding()
                .encodeToString(forgedClaims.toString().getBytes(StandardCharsets.UTF_8));
        String tampered = parts[0] + "." + forgedPayload + "." + parts[2];

        // Validly signed, but with a different secret.
        SignedJWT otherKey = new SignedJWT(new JWSHeader(JWSAlgorithm.HS256), SignedJWT.parse(token).getJWTClaimsSet());
        otherKey.sign(new MACSigner("another-secret-entirely-different-0123456789".getBytes(StandardCharsets.UTF_8)));

        // alg "none".
        String noneHeader = Base64.getUrlEncoder().withoutPadding().encodeToString("{\"alg\":\"none\"}".getBytes(StandardCharsets.UTF_8));
        String none = noneHeader + "." + parts[1] + ".";

        // HS512 with the same key: a different algorithm is refused even when the key is right.
        SignedJWT hs512 = new SignedJWT(new JWSHeader(JWSAlgorithm.HS512), SignedJWT.parse(token).getJWTClaimsSet());
        hs512.sign(new MACSigner((SECRET + SECRET).getBytes(StandardCharsets.UTF_8)));

        for (String bad : new String[] {tampered, otherKey.serialize(), none, hs512.serialize(), "not-a-jwt", "", parts[0] + "." + parts[1]}) {
            InvalidDecisionTokenException error = assertThrows(InvalidDecisionTokenException.class, () -> service.verify(bad));
            if (!bad.isEmpty()) {
                assertFalse(error.getMessage().contains(bad));
            }
        }
    }

    @Test
    @DisplayName("A validly signed token missing a required claim is rejected")
    void missingClaim() throws Exception {
        JWTClaimsSet claims = new JWTClaimsSet.Builder()
                .jwtID(UUID.randomUUID().toString()).subject(UUID.randomUUID().toString())
                .claim("tool", "t").claim("action", "READ").claim("src", "ALLOW")
                .issueTime(Date.from(START)).expirationTime(Date.from(START.plusSeconds(60))).build();
        SignedJWT jwt = new SignedJWT(new JWSHeader(JWSAlgorithm.HS256), claims);
        jwt.sign(new MACSigner(SECRET.getBytes(StandardCharsets.UTF_8)));
        assertThrows(InvalidDecisionTokenException.class, () -> service.verify(jwt.serialize()));
    }
}
