package com.agentshield.inspection;

import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * A password, secret, API key or token assigned a value: inline ({@code password=...}, {@code "api_key": "..."}),
 * or as the value of a JSON field or command-line flag with such a name. The value must be at least 8 characters
 * with Shannon entropy of at least 3.5 bits per character, so placeholders such as "changeme" or "${TOKEN}" pass.
 * SECRET.
 */
public class GenericSecretDetector implements Detector {

    static final String TYPE = "GENERIC_SECRET";
    static final int MIN_LENGTH = 8;
    static final double MIN_ENTROPY = 3.5;
    private static final String NAMES = "(?:password|passwd|secret|api[_-]?key|token)";
    static final Pattern INLINE = Pattern.compile("(?i)(?<![A-Za-z0-9])(?:[A-Za-z0-9]{1,30}[_-])?" + NAMES
            + "(?![A-Za-z0-9])[\"']?[ \\t]{0,5}[:=][ \\t]{0,5}[\"']?([^\\s\"'`,;&]{8,256})");
    static final Pattern KEY = Pattern.compile("(?i)-{0,2}(?:[A-Za-z0-9]{1,30}[_-]){0,3}" + NAMES);

    @Override
    public String name() {
        return "generic-secret";
    }

    @Override
    public FindingCategory category() {
        return FindingCategory.SECRET;
    }

    @Override
    public List<Detection> detect(String text, String key) {
        List<Detection> found = new ArrayList<>();
        if (key != null && key.length() <= 128 && KEY.matcher(key).matches()) {
            String value = text.trim();
            if (looksSecret(value)) {
                int start = text.indexOf(value);
                found.add(new Detection(TYPE, start, start + value.length()));
                return found;
            }
        }
        Matcher matcher = INLINE.matcher(text);
        while (matcher.find()) {
            if (looksSecret(matcher.group(1))) {
                found.add(new Detection(TYPE, matcher.start(1), matcher.end(1)));
            }
        }
        return found;
    }

    static boolean looksSecret(String value) {
        return value.length() >= MIN_LENGTH && Checksums.shannonEntropy(value) >= MIN_ENTROPY;
    }
}
