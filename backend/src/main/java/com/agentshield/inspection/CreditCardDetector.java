package com.agentshield.inspection;

import java.util.regex.Pattern;

/**
 * Payment card number: 13 to 19 digits (optionally separated by single spaces or dashes) that pass the Luhn check.
 * Only numbers starting 2-6 (the Mastercard, Amex, Visa and Discover ranges) are considered, so millisecond
 * timestamps and other long ids starting with 1 are not reported. PII.
 */
public class CreditCardDetector extends RegexDetector {

    static final Pattern PATTERN = Pattern.compile("(?<![0-9+])[2-6](?:[ -]?[0-9]){12,18}(?![0-9])");

    public CreditCardDetector() {
        super("credit-card", FindingCategory.PII, "CREDIT_CARD", PATTERN, 0, CreditCardDetector::valid);
    }

    static boolean valid(String value) {
        String digits = Checksums.digitsOnly(value);
        return digits.length() >= 13 && digits.length() <= 19 && Checksums.luhn(digits)
                && !digits.chars().allMatch(c -> c == digits.charAt(0));
    }
}
