package com.agentshield.inspection;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.regex.Pattern;

/**
 * JSON Web Token: three base64url parts whose first part decodes to a JSON object with an "alg" field. A JSON
 * header always starts with <code>{"</code>, which is "eyJ" in base64url; the pattern anchors on it so it never scans
 * arbitrary dotted text. The signature part may be empty (alg "none"). SECRET.
 */
public class JwtDetector extends RegexDetector {

    private static final ObjectMapper MAPPER = new ObjectMapper();
    static final Pattern PATTERN = Pattern.compile(
            "(?<![A-Za-z0-9_-])(eyJ[A-Za-z0-9_-]{5,2048})\\.[A-Za-z0-9_-]{2,8192}\\.[A-Za-z0-9_-]{0,2048}(?![A-Za-z0-9_-])");

    public JwtDetector() {
        super("jwt", FindingCategory.SECRET, "JWT", PATTERN, 0, JwtDetector::hasJsonHeaderWithAlg);
    }

    static boolean hasJsonHeaderWithAlg(String token) {
        String header = token.substring(0, token.indexOf('.'));
        try {
            byte[] decoded = Base64.getUrlDecoder().decode(header.replace("=", ""));
            JsonNode node = MAPPER.readTree(new String(decoded, StandardCharsets.UTF_8));
            return node != null && node.isObject() && node.hasNonNull("alg");
        } catch (Exception notAJwt) {
            return false;
        }
    }
}
