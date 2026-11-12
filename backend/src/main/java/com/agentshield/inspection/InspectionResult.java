package com.agentshield.inspection;

import java.util.List;

/**
 * Result of inspecting one request's resource (always) and arguments (when sent).
 *
 * @param verdict       CLEAN, REVIEW or DENY; null only when inspection is disabled
 * @param findings      redacted findings (at most {@link ContentInspector#MAX_FINDINGS}); empty when CLEAN
 * @param totalFindings how many findings there were before the cap
 */
public record InspectionResult(InspectionVerdict verdict, List<Finding> findings, int totalFindings) {

    public static final InspectionResult NOT_INSPECTED = new InspectionResult(null, List.of(), 0);

    public boolean inspected() {
        return verdict != null;
    }

    /** Findings to persist: null when inspection did not run, so the column stays NULL ("not recorded"). */
    public List<Finding> findingsOrNull() {
        return inspected() ? findings : null;
    }
}
