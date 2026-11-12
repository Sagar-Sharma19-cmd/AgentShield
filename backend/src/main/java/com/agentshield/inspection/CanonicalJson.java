package com.agentshield.inspection;

import com.fasterxml.jackson.core.io.JsonStringEncoder;
import com.fasterxml.jackson.databind.JsonNode;

import java.util.ArrayList;
import java.util.Iterator;
import java.util.List;
import java.util.Map;

/**
 * Canonical JSON for hashing tool-call arguments: object keys sorted, no whitespace, integers as plain digits,
 * other numbers as a normalised decimal. The gateway computes it both when it decides (evaluate) and when the
 * agent redeems the decision, from the JSON the agent sent each time, so the two hashes match whenever the
 * agent sent the same JSON value. Clients never compute it.
 */
public final class CanonicalJson {

    private CanonicalJson() {
    }

    public static String write(JsonNode node) {
        StringBuilder out = new StringBuilder();
        write(node, out);
        return out.toString();
    }

    private static void write(JsonNode node, StringBuilder out) {
        if (node == null || node.isNull() || node.isMissingNode()) {
            out.append("null");
        } else if (node.isObject()) {
            List<String> names = new ArrayList<>();
            node.fieldNames().forEachRemaining(names::add);
            names.sort(null);
            out.append('{');
            for (int i = 0; i < names.size(); i++) {
                if (i > 0) {
                    out.append(',');
                }
                quote(names.get(i), out);
                out.append(':');
                write(node.get(names.get(i)), out);
            }
            out.append('}');
        } else if (node.isArray()) {
            out.append('[');
            for (int i = 0; i < node.size(); i++) {
                if (i > 0) {
                    out.append(',');
                }
                write(node.get(i), out);
            }
            out.append(']');
        } else if (node.isTextual()) {
            quote(node.textValue(), out);
        } else if (node.isIntegralNumber()) {
            out.append(node.bigIntegerValue().toString());
        } else if (node.isNumber()) {
            out.append(node.decimalValue().stripTrailingZeros().toString());
        } else if (node.isBoolean()) {
            out.append(node.booleanValue());
        } else {
            quote(node.asText(), out);
        }
    }

    private static void quote(String value, StringBuilder out) {
        out.append('"');
        JsonStringEncoder.getInstance().quoteAsString(value, out);
        out.append('"');
    }

    /**
     * Nesting depth: a scalar is 0, {@code []} and {@code {}} are 1. Stops counting once {@code limit} is
     * exceeded, so a hostile document cannot make this walk deep.
     */
    public static int depth(JsonNode node, int limit) {
        return depth(node, 0, limit);
    }

    private static int depth(JsonNode node, int current, int limit) {
        if (node == null || !node.isContainerNode()) {
            return current;
        }
        int here = current + 1;
        if (here > limit) {
            return here;
        }
        int max = here;
        Iterator<Map.Entry<String, JsonNode>> fields = node.isObject() ? node.fields() : null;
        if (fields != null) {
            while (fields.hasNext()) {
                max = Math.max(max, depth(fields.next().getValue(), here, limit));
                if (max > limit) {
                    return max;
                }
            }
        } else {
            for (JsonNode child : node) {
                max = Math.max(max, depth(child, here, limit));
                if (max > limit) {
                    return max;
                }
            }
        }
        return max;
    }
}
