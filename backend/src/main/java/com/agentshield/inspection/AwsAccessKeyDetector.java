package com.agentshield.inspection;

import java.util.regex.Pattern;

/** AWS access key id: AKIA (long-term) or ASIA (temporary) followed by 16 upper-case letters or digits. SECRET. */
public class AwsAccessKeyDetector extends RegexDetector {

    static final Pattern PATTERN = Pattern.compile("(?<![A-Za-z0-9])(?:AKIA|ASIA)[A-Z0-9]{16}(?![A-Za-z0-9])");

    public AwsAccessKeyDetector() {
        super("aws-access-key", FindingCategory.SECRET, "AWS_ACCESS_KEY", PATTERN);
    }
}
