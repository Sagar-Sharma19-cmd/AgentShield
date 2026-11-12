package com.agentshield.dto;

import com.agentshield.inspection.Finding;
import com.agentshield.inspection.InspectionVerdict;

import java.util.List;
import java.util.UUID;

/**
 * Result of an output inspection: the verdict, the redacted findings (location "content") and the content with
 * every finding replaced by {@code [REDACTED:<TYPE>]}. {@code requestId} identifies the audit row.
 */
public record InspectOutputResponse(UUID requestId, InspectionVerdict verdict, List<Finding> findings,
                                    String redactedContent) {
    @Override
    public String toString() {
        return "InspectOutputResponse[requestId=" + requestId + ", verdict=" + verdict + ", findings="
                + (findings == null ? 0 : findings.size()) + "]";
    }
}
