package com.agentshield.inspection;

import java.util.regex.Pattern;

/**
 * Indian Permanent Account Number: AAAAA9999A, where the fourth letter is the holder type
 * (P, C, H, F, A, T, B, L, J or G). Upper case only, as issued. PII.
 */
public class PanDetector extends RegexDetector {

    static final Pattern PATTERN = Pattern.compile("(?<![A-Za-z0-9])[A-Z]{3}[ABCFGHJLPT][A-Z][0-9]{4}[A-Z](?![A-Za-z0-9])");

    public PanDetector() {
        super("pan", FindingCategory.PII, "PAN", PATTERN);
    }
}
