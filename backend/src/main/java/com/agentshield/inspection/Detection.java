package com.agentshield.inspection;

/** A detector match inside one string: the type and the [start, end) span. Never leaves the inspection package. */
public record Detection(String type, int start, int end) {
}
