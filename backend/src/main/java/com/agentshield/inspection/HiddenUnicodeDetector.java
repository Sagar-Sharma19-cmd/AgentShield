package com.agentshield.inspection;

import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Characters that hide text from a human reader: Unicode tag characters (U+E0000-U+E007F, invisible, used to
 * smuggle instructions to a model) and bidirectional override/isolate controls (U+202A-U+202E, U+2066-U+2069,
 * which reorder what is displayed). PROMPT_INJECTION.
 */
public class HiddenUnicodeDetector implements Detector {

    static final Pattern TAGS = Pattern.compile("[\\x{E0000}-\\x{E007F}]{1,4096}");
    static final Pattern BIDI = Pattern.compile("[\\x{202A}-\\x{202E}\\x{2066}-\\x{2069}]{1,4096}");

    @Override
    public String name() {
        return "hidden-unicode";
    }

    @Override
    public FindingCategory category() {
        return FindingCategory.PROMPT_INJECTION;
    }

    @Override
    public List<Detection> detect(String text, String key) {
        List<Detection> found = new ArrayList<>();
        collect(TAGS.matcher(text), "UNICODE_TAG_CHARACTERS", found);
        collect(BIDI.matcher(text), "BIDI_CONTROL", found);
        return found;
    }

    private static void collect(Matcher matcher, String type, List<Detection> found) {
        while (matcher.find()) {
            found.add(new Detection(type, matcher.start(), matcher.end()));
        }
    }
}
