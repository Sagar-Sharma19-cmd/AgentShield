package com.agentshield.inspection;

import java.util.regex.Pattern;

/**
 * Aadhaar number: 12 digits, not starting with 0 or 1, optionally grouped 4-4-4 with one consistent separator,
 * whose last digit is a valid Verhoeff check digit. PII.
 */
public class AadhaarDetector extends RegexDetector {

    static final Pattern PATTERN = Pattern.compile("(?<![0-9+])[2-9][0-9]{3}([ -]?)[0-9]{4}\\1[0-9]{4}(?![0-9])");

    public AadhaarDetector() {
        super("aadhaar", FindingCategory.PII, "AADHAAR", PATTERN, 0,
                value -> Checksums.verhoeff(Checksums.digitsOnly(value)));
    }
}
