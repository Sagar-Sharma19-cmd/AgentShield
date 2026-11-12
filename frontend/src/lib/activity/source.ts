/**
 * Where an audit row came from, read from its session id, and how output-check rows read in Activity. Pure; tested in
 * source.test.ts. No backend change: both are derived from fields every audit row already has.
 *
 * Session prefixes (src/lib/pipeline/runs.ts): "mcp-" agentshield-mcp-proxy, "guard-" a bare agentshield-guard,
 * "jenkins-" a Jenkins build through the guard, "ci-<pipeline>-" the CI/CD simulator. Anything else has no label.
 */
import { findingTypeLabel } from "@/lib/inspection/findings";
import { realRunSource, RUN_SESSION_PATTERN } from "@/lib/pipeline/runs";
import type { ContentFinding, InspectionVerdict } from "@/types/api";

export type SessionSource = "mcp" | "guard" | "jenkins" | "simulator";

export const SESSION_SOURCE_LABELS: Record<SessionSource, string> = {
  mcp: "MCP proxy",
  guard: "Guard",
  jenkins: "Jenkins",
  simulator: "Simulator",
};

/** The source of a session id, or null when it is none of the known clients. */
export function sessionSource(sessionId: string): SessionSource | null {
  const real = realRunSource(sessionId);
  if (real) return real.source;
  return RUN_SESSION_PATTERN.test(sessionId) ? "simulator" : null;
}

/** Output-inspection rows (POST /gateway/inspect) are recorded as READ on "output:<tool>". */
export const OUTPUT_RESOURCE_PREFIX = "output:";

export function isOutputCheck(resource: string): boolean {
  return resource.startsWith(OUTPUT_RESOURCE_PREFIX);
}

export const OUTPUT_CHECK_LABEL = "Output check";

/**
 * The gateway's verdict. What the caller then did with the output is not recorded (the MCP proxy withholds DENY output
 * and passes REVIEW output on redacted; another SDK caller may differ), so the label states only the verdict.
 */
export const OUTPUT_VERDICT_LABELS: Record<InspectionVerdict, string> = {
  CLEAN: "Clean",
  REVIEW: "Review",
  DENY: "Deny",
};

/**
 * One line for an output-check row: its verdict and the distinct finding types, e.g. "Deny · AWS access key".
 * "Not inspected" when the row has no verdict (inspection disabled or not recorded).
 */
export function outputCheckSummary(row: {
  inspectionVerdict?: InspectionVerdict | null;
  inspectionFindings?: readonly ContentFinding[] | null;
}): string {
  if (!row.inspectionVerdict) return "Not inspected";
  const types = Array.from(new Set((row.inspectionFindings ?? []).map((finding) => findingTypeLabel(finding.type))));
  const verdict = OUTPUT_VERDICT_LABELS[row.inspectionVerdict];
  return types.length > 0 ? `${verdict} · ${types.join(", ")}` : verdict;
}
