package com.agentshield.inspection;

import java.util.List;

/**
 * One content detector. Detectors are pure and stateless; every regex uses bounded quantifiers only, so a
 * match is linear in the input (no catastrophic backtracking).
 */
public interface Detector {

    /** Configuration name: {@code agentshield.inspection.<name>.enabled}. */
    String name();

    FindingCategory category();

    /**
     * @param text the string to scan
     * @param key  the JSON field name (or command-line flag) the string is the value of, or null.
     *             Detectors that only fire next to a key name (an AWS secret key, a password) use it.
     */
    List<Detection> detect(String text, String key);
}
