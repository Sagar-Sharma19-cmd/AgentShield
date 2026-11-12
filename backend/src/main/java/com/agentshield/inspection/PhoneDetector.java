package com.agentshield.inspection;

import java.util.regex.Pattern;

/** Phone number in E.164 form: "+", a non-zero digit, then 7 to 14 more digits (8 to 15 in total). PII. */
public class PhoneDetector extends RegexDetector {

    static final Pattern PATTERN = Pattern.compile("(?<![A-Za-z0-9+])\\+[1-9][0-9]{7,14}(?![0-9])");

    public PhoneDetector() {
        super("phone", FindingCategory.PII, "PHONE_NUMBER", PATTERN);
    }
}
