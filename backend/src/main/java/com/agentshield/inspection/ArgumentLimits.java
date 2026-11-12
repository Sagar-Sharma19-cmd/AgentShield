package com.agentshield.inspection;

import com.agentshield.enforcement.DecisionTokenService;
import com.agentshield.exception.InvalidArgumentsException;
import com.fasterxml.jackson.databind.JsonNode;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.nio.charset.StandardCharsets;

/**
 * Checks the optional "arguments" of an evaluate or redeem request: a JSON string, array or object, at most
 * {@code agentshield.inspection.max-argument-bytes} (default 64 KB) as canonical JSON, nested at most
 * {@code agentshield.inspection.max-argument-depth} (default 10) levels. Anything else is a 400 whose message
 * never contains the arguments. Applies even when inspection is disabled, because the hash still binds the token.
 */
@Component
public class ArgumentLimits {

    private final int maxBytes;
    private final int maxDepth;

    public ArgumentLimits(@Value("${agentshield.inspection.max-argument-bytes:65536}") int maxBytes,
                          @Value("${agentshield.inspection.max-argument-depth:10}") int maxDepth) {
        if (maxBytes <= 0 || maxDepth <= 0) {
            throw new IllegalStateException("agentshield.inspection.max-argument-bytes and max-argument-depth must be positive.");
        }
        this.maxBytes = maxBytes;
        this.maxDepth = maxDepth;
    }

    public int maxBytes() {
        return maxBytes;
    }

    public int maxDepth() {
        return maxDepth;
    }

    /** True when the request carried no arguments (field absent or JSON null). */
    public static boolean absent(JsonNode arguments) {
        return arguments == null || arguments.isNull() || arguments.isMissingNode();
    }

    /** @return null when there are no arguments; otherwise the checked arguments and their hash */
    public PreparedArguments prepare(JsonNode arguments) {
        if (absent(arguments)) {
            return null;
        }
        if (!(arguments.isTextual() || arguments.isArray() || arguments.isObject())) {
            throw new InvalidArgumentsException("arguments must be a JSON string, array or object.");
        }
        if (CanonicalJson.depth(arguments, maxDepth) > maxDepth) {
            throw new InvalidArgumentsException("arguments are nested more than " + maxDepth + " levels deep.");
        }
        String canonical = CanonicalJson.write(arguments);
        int bytes = canonical.getBytes(StandardCharsets.UTF_8).length;
        if (bytes > maxBytes) {
            throw new InvalidArgumentsException("arguments are " + bytes + " bytes as JSON; the limit is "
                    + maxBytes + " bytes.");
        }
        return new PreparedArguments(arguments, DecisionTokenService.sha256Hex(canonical), bytes);
    }
}
