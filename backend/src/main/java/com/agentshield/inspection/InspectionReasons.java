package com.agentshield.inspection;

import java.util.Comparator;
import java.util.List;
import java.util.Map;

/**
 * Reason text for a decision changed by content inspection. Names the finding and where it is, never the value:
 * "Arguments contain an AWS access key at arguments[3]. Secrets must not be sent to tools."
 */
public final class InspectionReasons {

    static final int MAX_LOCATION_IN_REASON = 120;

    private static final Map<String, String> LABELS = Map.ofEntries(
            Map.entry("AWS_ACCESS_KEY", "an AWS access key"),
            Map.entry("AWS_SECRET_KEY", "an AWS secret key"),
            Map.entry("PRIVATE_KEY", "a private key"),
            Map.entry("GITHUB_TOKEN", "a GitHub token"),
            Map.entry("SLACK_TOKEN", "a Slack token"),
            Map.entry("STRIPE_LIVE_KEY", "a Stripe live key"),
            Map.entry("GOOGLE_API_KEY", "a Google API key"),
            Map.entry("JWT", "a JSON Web Token"),
            Map.entry("GENERIC_SECRET", "a password or secret value"),
            Map.entry("EMAIL", "an email address"),
            Map.entry("CREDIT_CARD", "a payment card number"),
            Map.entry("PAN", "an Indian PAN"),
            Map.entry("AADHAAR", "an Aadhaar number"),
            Map.entry("PHONE_NUMBER", "a phone number"),
            Map.entry("INSTRUCTION_OVERRIDE", "an instruction-override phrase (possible prompt injection)"),
            Map.entry("UNICODE_TAG_CHARACTERS", "hidden Unicode tag characters (possible prompt injection)"),
            Map.entry("BIDI_CONTROL", "bidirectional text control characters (possible prompt injection)"));

    private InspectionReasons() {
    }

    public static String label(String type) {
        return LABELS.getOrDefault(type, "sensitive content (" + type + ")");
    }

    /** The finding that explains the verdict: the first one of the strictest category. */
    static Finding leading(List<Finding> findings) {
        return findings.stream()
                .min(Comparator.comparingInt(f -> -f.category().verdict().ordinal()))
                .orElseThrow();
    }

    /** "Arguments contain an AWS access key at arguments[3]. Secrets must not be sent to tools." */
    public static String denial(InspectionResult result) {
        return describe(result) + " Secrets must not be sent to tools.";
    }

    /** Appended to the policy reason when inspection raised the decision to REVIEW. */
    public static String reviewNote(InspectionResult result) {
        return " Held for review by content inspection: " + lowerFirst(describe(result))
                + " A person must check this before it is sent.";
    }

    private static String describe(InspectionResult result) {
        Finding lead = leading(result.findings());
        String where = lead.location().length() <= MAX_LOCATION_IN_REASON ? lead.location()
                : "…" + lead.location().substring(lead.location().length() - MAX_LOCATION_IN_REASON + 1);
        String sentence = "resource".equals(where)
                ? "The resource contains " + label(lead.type()) + "."
                : "Arguments contain " + label(lead.type()) + " at " + where + ".";
        int more = result.totalFindings() - 1;
        if (more > 0) {
            sentence = sentence.substring(0, sentence.length() - 1) + " (and " + more + " more finding"
                    + (more == 1 ? "" : "s") + ").";
        }
        return sentence;
    }

    private static String lowerFirst(String s) {
        return Character.toLowerCase(s.charAt(0)) + s.substring(1);
    }
}
