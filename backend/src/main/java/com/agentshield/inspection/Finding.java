package com.agentshield.inspection;

/**
 * One piece of sensitive content, described without its value.
 *
 * @param category SECRET, PII or PROMPT_INJECTION
 * @param type     what was found, for example AWS_ACCESS_KEY or EMAIL
 * @param location where: a JSON path such as {@code arguments[3]} or {@code arguments.body.token},
 *                 {@code resource}, or {@code content} (output inspection)
 * @param preview  a redacted preview: for secrets and injection phrases the first 4 characters and the
 *                 length ({@code AKIA… (20 chars)}); for PII only the type and length. Never the full value.
 */
public record Finding(FindingCategory category, String type, String location, String preview) {
}
