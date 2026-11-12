package com.agentshield.inspection;

import java.util.regex.Pattern;

/** Slack tokens: xoxb-, xoxa-, xoxp-, xoxr-, xoxs-. SECRET. */
public class SlackTokenDetector extends RegexDetector {

    static final Pattern PATTERN = Pattern.compile("(?<![A-Za-z0-9])xox[baprs]-[A-Za-z0-9-]{10,250}(?![A-Za-z0-9-])");

    public SlackTokenDetector() {
        super("slack-token", FindingCategory.SECRET, "SLACK_TOKEN", PATTERN);
    }
}
