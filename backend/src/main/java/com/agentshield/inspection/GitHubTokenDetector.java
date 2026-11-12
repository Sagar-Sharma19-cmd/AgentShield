package com.agentshield.inspection;

import java.util.regex.Pattern;

/** GitHub tokens: personal (ghp_), OAuth (gho_) and fine-grained personal access tokens (github_pat_). SECRET. */
public class GitHubTokenDetector extends RegexDetector {

    static final Pattern PATTERN = Pattern.compile(
            "(?<![A-Za-z0-9_])(?:gh[po]_[A-Za-z0-9]{36}|github_pat_[A-Za-z0-9_]{22,255})(?![A-Za-z0-9_])");

    public GitHubTokenDetector() {
        super("github-token", FindingCategory.SECRET, "GITHUB_TOKEN", PATTERN);
    }
}
