package com.agentshield.inspection;

/** Result of content inspection, ordered from least to most restrictive. */
public enum InspectionVerdict {
    CLEAN,
    REVIEW,
    DENY;

    public InspectionVerdict max(InspectionVerdict other) {
        return other != null && other.compareTo(this) > 0 ? other : this;
    }
}
