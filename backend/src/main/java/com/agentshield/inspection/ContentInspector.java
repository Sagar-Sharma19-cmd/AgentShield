package com.agentshield.inspection;

import com.fasterxml.jackson.databind.JsonNode;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;

/**
 * Content inspection (Phase V13): looks at what an agent is about to send to a tool, not only which tool,
 * action and resource. Walks every string (and number, and object key) of the arguments plus the resource, runs
 * each enabled detector, and returns redacted findings with the strictest verdict: any SECRET is DENY, any PII or
 * PROMPT_INJECTION is REVIEW, otherwise CLEAN.
 *
 * Configuration: {@code agentshield.inspection.enabled} (default true) and
 * {@code agentshield.inspection.<detector>.enabled} (default true) for each detector name in {@link #allDetectors()}.
 *
 * Raw values never leave this class: a {@link Finding} holds a JSON path and a redacted preview only. Nothing here
 * logs anything.
 */
@Component
public class ContentInspector {

    /** Findings kept per request; the rest are only counted (keeps audit rows and reasons small). */
    public static final int MAX_FINDINGS = 50;
    /** A JSON path segment longer than this is shortened in locations. */
    static final int MAX_LOCATION_LENGTH = 200;

    private static final Pattern SIMPLE_KEY = Pattern.compile("[A-Za-z_$][A-Za-z0-9_$-]{0,63}");
    private static final Pattern FLAG = Pattern.compile("-{1,2}[A-Za-z0-9][A-Za-z0-9_-]{0,62}");

    private final boolean enabled;
    private final List<Detector> detectors;

    @Autowired
    public ContentInspector(Environment environment) {
        this(environment.getProperty("agentshield.inspection.enabled", Boolean.class, true),
                allDetectors().stream()
                        .filter(d -> environment.getProperty("agentshield.inspection." + d.name() + ".enabled",
                                Boolean.class, true))
                        .toList());
    }

    public ContentInspector(boolean enabled, List<Detector> detectors) {
        this.enabled = enabled;
        this.detectors = List.copyOf(detectors);
    }

    /** Every detector, in the order findings are reported. */
    public static List<Detector> allDetectors() {
        return List.of(
                new AwsAccessKeyDetector(), new AwsSecretKeyDetector(), new PrivateKeyDetector(),
                new GitHubTokenDetector(), new SlackTokenDetector(), new StripeKeyDetector(),
                new GoogleApiKeyDetector(), new JwtDetector(), new GenericSecretDetector(),
                new EmailDetector(), new CreditCardDetector(), new PanDetector(), new AadhaarDetector(),
                new PhoneDetector(), new PromptInjectionDetector(), new HiddenUnicodeDetector());
    }

    public boolean enabled() {
        return enabled;
    }

    public List<String> enabledDetectorNames() {
        return detectors.stream().map(Detector::name).toList();
    }

    /**
     * Inspects a request's resource and, when present, its arguments (V13.1: the resource is inspected on every
     * request, with or without arguments). Only with inspection disabled is nothing inspected, and the result is
     * then {@link InspectionResult#NOT_INSPECTED}. A clean request is CLEAN with no findings.
     */
    public InspectionResult inspect(PreparedArguments arguments, String resource) {
        if (!enabled) {
            return InspectionResult.NOT_INSPECTED;
        }
        Collector collector = new Collector();
        if (arguments != null) {
            walk(arguments.node(), "arguments", null, collector);
        }
        if (resource != null) {
            collector.scan(resource, null, "resource");
        }
        return new InspectionResult(collector.verdict, collector.findings, collector.total);
    }

    /**
     * Inspects free text (tool output). Returns the verdict, the findings at {@code location}, and the content with
     * every finding span replaced by {@code [REDACTED:<TYPE>]}. With inspection disabled the content is returned
     * unchanged with a CLEAN verdict.
     */
    public TextInspection inspectText(String content, String location) {
        if (!enabled || content == null || content.isEmpty()) {
            return new TextInspection(InspectionVerdict.CLEAN, List.of(), 0, content);
        }
        Collector collector = new Collector();
        List<Detection> spans = collector.scan(content, null, location);
        return new TextInspection(collector.verdict, collector.findings, collector.total, redact(content, spans));
    }

    /** The text with only its SECRET spans replaced by [REDACTED:TYPE] (used to audit a resource that held a secret). */
    public String redactSecrets(String text) {
        if (text == null || text.isEmpty()) {
            return text;
        }
        List<Detection> spans = new ArrayList<>();
        for (Detector detector : detectors) {
            if (detector.category() == FindingCategory.SECRET) {
                spans.addAll(detector.detect(text, null));
            }
        }
        return redact(text, spans);
    }

    private void walk(JsonNode node, String path, String key, Collector collector) {
        if (node == null || node.isNull()) {
            return;
        }
        if (node.isTextual()) {
            collector.scan(node.textValue(), key, path);
        } else if (node.isNumber()) {
            collector.scan(node.asText(), key, path);
        } else if (node.isArray()) {
            for (int i = 0; i < node.size(); i++) {
                // In an argv-style list, "--password" makes the next element the password's value.
                String flag = null;
                if (i > 0 && node.get(i - 1).isTextual() && FLAG.matcher(node.get(i - 1).textValue()).matches()) {
                    flag = node.get(i - 1).textValue();
                }
                walk(node.get(i), path + "[" + i + "]", flag, collector);
            }
        } else if (node.isObject()) {
            int index = 0;
            var fields = node.fields();
            while (fields.hasNext()) {
                Map.Entry<String, JsonNode> field = fields.next();
                index++;
                String name = field.getKey();
                // A field name can itself be sensitive: inspect it, and never put a sensitive name into a path.
                boolean nameHasFindings = !collector.scan(name, null, path + " (field name #" + index + ")").isEmpty();
                String segment = !nameHasFindings && SIMPLE_KEY.matcher(name).matches()
                        ? "." + name
                        : ".<field #" + index + ">";
                walk(field.getValue(), shorten(path + segment), name, collector);
            }
        }
    }

    private static String shorten(String location) {
        return location.length() <= MAX_LOCATION_LENGTH ? location
                : "…" + location.substring(location.length() - (MAX_LOCATION_LENGTH - 1));
    }

    /** Replaces each span with [REDACTED:TYPE]; overlapping spans are merged into the first one's type. */
    static String redact(String content, List<Detection> spans) {
        if (spans.isEmpty()) {
            return content;
        }
        List<Detection> sorted = new ArrayList<>(spans);
        sorted.sort(Comparator.comparingInt(Detection::start).thenComparing(d -> -d.end()));
        StringBuilder out = new StringBuilder(content.length());
        int cursor = 0;
        Detection open = null;
        int openEnd = -1;
        for (Detection d : sorted) {
            if (open != null && d.start() < openEnd) {
                openEnd = Math.max(openEnd, d.end());
                continue;
            }
            if (open != null) {
                out.append("[REDACTED:").append(open.type()).append(']');
                cursor = openEnd;
            }
            out.append(content, cursor, d.start());
            open = d;
            openEnd = d.end();
        }
        out.append("[REDACTED:").append(open.type()).append(']');
        out.append(content, openEnd, content.length());
        return out.toString();
    }

    /** The redacted preview of a matched value. */
    static String preview(FindingCategory category, String type, String value) {
        int length = value.codePointCount(0, value.length());
        if (category == FindingCategory.PII) {
            return "[" + type + "] (" + length + " chars)";
        }
        if (type.equals("UNICODE_TAG_CHARACTERS") || type.equals("BIDI_CONTROL")) {
            return length + " hidden character" + (length == 1 ? "" : "s");
        }
        int headEnd = value.offsetByCodePoints(0, Math.min(4, length));
        return value.substring(0, headEnd) + "… (" + length + " chars)";
    }

    /** Accumulates findings and the strictest verdict for one inspection. */
    private final class Collector {
        private final List<Finding> findings = new ArrayList<>();
        private InspectionVerdict verdict = InspectionVerdict.CLEAN;
        private int total;

        /** Runs every detector over one string and records its findings at {@code location}. */
        List<Detection> scan(String text, String key, String location) {
            if (text == null || text.isEmpty()) {
                return List.of();
            }
            List<Detection> kept = new ArrayList<>();
            List<FindingCategory> categories = new ArrayList<>();
            for (Detector detector : detectors) {
                for (Detection detection : detector.detect(text, key)) {
                    boolean contained = kept.stream()
                            .anyMatch(k -> k.start() <= detection.start() && detection.end() <= k.end());
                    if (!contained) {
                        kept.add(detection);
                        categories.add(detector.category());
                    }
                }
            }
            for (int i = 0; i < kept.size(); i++) {
                Detection d = kept.get(i);
                FindingCategory category = categories.get(i);
                total++;
                verdict = verdict.max(category.verdict());
                if (findings.size() < MAX_FINDINGS) {
                    findings.add(new Finding(category, d.type(), shorten(location),
                            preview(category, d.type(), text.substring(d.start(), d.end()))));
                }
            }
            return kept;
        }
    }
}
