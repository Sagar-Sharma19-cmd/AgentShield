package com.agentshield.inspection;

import java.util.regex.Pattern;

/** Stripe live secret keys (sk_live_). Test keys (sk_test_) are not secrets that move money. SECRET. */
public class StripeKeyDetector extends RegexDetector {

    static final Pattern PATTERN = Pattern.compile("(?<![A-Za-z0-9_])sk_live_[A-Za-z0-9]{16,128}(?![A-Za-z0-9])");

    public StripeKeyDetector() {
        super("stripe-key", FindingCategory.SECRET, "STRIPE_LIVE_KEY", PATTERN);
    }
}
