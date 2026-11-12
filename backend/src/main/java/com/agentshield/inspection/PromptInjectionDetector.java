package com.agentshield.inspection;

import java.util.regex.Pattern;

/**
 * A small, curated list of instruction-override phrases (case-insensitive). It is a tripwire for the common
 * phrasings, not a classifier: it sends the request to a human, it never blocks on its own. PROMPT_INJECTION.
 */
public class PromptInjectionDetector extends RegexDetector {

    private static final String S = "\\s{1,5}";
    static final Pattern PATTERN = Pattern.compile("(?iu)(?<![\\p{L}\\p{N}])(?:"
            + "ignore" + S + "(?:all" + S + ")?(?:the" + S + "|your" + S + "|any" + S + ")?(?:previous|prior|above|earlier)"
            + S + "instructions"
            + "|disregard" + S + "(?:the" + S + "|your" + S + "|all" + S + ")?(?:system" + S + "prompt|(?:previous|prior)"
            + S + "instructions)"
            + "|forget" + S + "(?:all" + S + ")?(?:your|the|previous|prior)" + S + "instructions"
            + "|you" + S + "are" + S + "now"
            + "|reveal" + S + "(?:your|the)" + S + "(?:system" + S + "prompt|hidden" + S + "instructions)"
            + "|begin" + S + "system" + S + "prompt"
            + ")(?![\\p{L}\\p{N}])");

    public PromptInjectionDetector() {
        super("prompt-injection", FindingCategory.PROMPT_INJECTION, "INSTRUCTION_OVERRIDE", PATTERN);
    }
}
