package com.agentshield.inspection;

import java.util.regex.Pattern;

/**
 * Email address. Flagged wherever it appears, including a "to" field: sending it to a tool is a PII flow that a
 * human should see. "git@host" (an SSH remote, not a mailbox) is not reported. PII.
 */
public class EmailDetector extends RegexDetector {

    static final Pattern PATTERN = Pattern.compile("(?<![A-Za-z0-9._%+-])([A-Za-z0-9._%+-]{1,64})@[A-Za-z0-9-]{1,63}"
            + "(?:\\.[A-Za-z0-9-]{1,63}){0,8}\\.[A-Za-z]{2,24}(?![A-Za-z0-9-])");

    public EmailDetector() {
        super("email", FindingCategory.PII, "EMAIL", PATTERN, 0, value -> !value.startsWith("git@"));
    }
}
