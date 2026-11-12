package com.agentshield.inspection;

import com.fasterxml.jackson.databind.JsonNode;

/**
 * Arguments that passed the size, depth and type limits. Never persisted or logged: only {@link #sha256()} is
 * stored (on a review) or signed (into a decision token). toString never shows the value.
 *
 * @param node      the parsed arguments
 * @param sha256    SHA-256 hex of the canonical JSON (sorted keys, no whitespace)
 * @param byteCount UTF-8 size of the canonical JSON
 */
public record PreparedArguments(JsonNode node, String sha256, int byteCount) {
    @Override
    public String toString() {
        return "PreparedArguments[<redacted " + byteCount + " bytes>, sha256=" + sha256 + "]";
    }
}
