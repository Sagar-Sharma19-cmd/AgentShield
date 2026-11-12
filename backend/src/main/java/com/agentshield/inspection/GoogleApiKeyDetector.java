package com.agentshield.inspection;

import java.util.regex.Pattern;

/** Google API key: AIza followed by 35 characters from [0-9A-Za-z_-]. SECRET. */
public class GoogleApiKeyDetector extends RegexDetector {

    static final Pattern PATTERN = Pattern.compile("(?<![A-Za-z0-9_-])AIza[0-9A-Za-z_-]{35}(?![A-Za-z0-9_-])");

    public GoogleApiKeyDetector() {
        super("google-api-key", FindingCategory.SECRET, "GOOGLE_API_KEY", PATTERN);
    }
}
