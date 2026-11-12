package com.agentshield.inspection;

import java.util.List;

/** Result of inspecting tool output: the verdict, redacted findings and the content with each finding replaced. */
public record TextInspection(InspectionVerdict verdict, List<Finding> findings, int totalFindings,
                             String redactedContent) {
}
