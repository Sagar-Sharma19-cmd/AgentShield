package com.agentshield.inspection;

import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * AWS secret access key: 40 base64 characters, but only next to an AWS secret key name (on its own the shape is
 * too common). Either inline, {@code aws_secret_access_key = <40 chars>}, or as the value of a JSON field or
 * command-line flag with that name. SECRET.
 */
public class AwsSecretKeyDetector implements Detector {

    static final String TYPE = "AWS_SECRET_KEY";
    private static final String NAME = "aws[_-]?secret[_-]?(?:access[_-]?)?key";
    static final Pattern INLINE = Pattern.compile("(?i)(?<![A-Za-z0-9])" + NAME
            + "[\"']?[ \\t]{0,5}[:=][ \\t]{0,5}[\"']?([A-Za-z0-9/+=]{40})(?![A-Za-z0-9/+=])");
    static final Pattern KEY = Pattern.compile("(?i)-{0,2}" + NAME);
    static final Pattern VALUE = Pattern.compile("[A-Za-z0-9/+=]{40}");

    @Override
    public String name() {
        return "aws-secret-key";
    }

    @Override
    public FindingCategory category() {
        return FindingCategory.SECRET;
    }

    @Override
    public List<Detection> detect(String text, String key) {
        List<Detection> found = new ArrayList<>();
        if (key != null && key.length() <= 64 && KEY.matcher(key).matches() && VALUE.matcher(text.trim()).matches()) {
            int start = text.indexOf(text.trim());
            found.add(new Detection(TYPE, start, start + 40));
            return found;
        }
        Matcher matcher = INLINE.matcher(text);
        while (matcher.find()) {
            found.add(new Detection(TYPE, matcher.start(1), matcher.end(1)));
        }
        return found;
    }
}
