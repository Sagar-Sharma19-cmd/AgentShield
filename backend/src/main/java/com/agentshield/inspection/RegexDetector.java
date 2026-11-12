package com.agentshield.inspection;

import java.util.ArrayList;
import java.util.List;
import java.util.function.Predicate;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** A detector that reports each match of a pattern (optionally one group of it) that passes a check. */
public class RegexDetector implements Detector {

    private final String name;
    private final FindingCategory category;
    private final String type;
    private final Pattern pattern;
    private final int group;
    private final Predicate<String> check;

    public RegexDetector(String name, FindingCategory category, String type, Pattern pattern) {
        this(name, category, type, pattern, 0, value -> true);
    }

    public RegexDetector(String name, FindingCategory category, String type, Pattern pattern, int group,
                         Predicate<String> check) {
        this.name = name;
        this.category = category;
        this.type = type;
        this.pattern = pattern;
        this.group = group;
        this.check = check;
    }

    @Override
    public String name() {
        return name;
    }

    @Override
    public FindingCategory category() {
        return category;
    }

    @Override
    public List<Detection> detect(String text, String key) {
        List<Detection> found = new ArrayList<>();
        Matcher matcher = pattern.matcher(text);
        while (matcher.find()) {
            String value = matcher.group(group);
            if (value != null && check.test(value)) {
                found.add(new Detection(type, matcher.start(group), matcher.end(group)));
            }
        }
        return found;
    }
}
