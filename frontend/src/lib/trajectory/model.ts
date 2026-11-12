import type { EscalationSource, RiskTier } from "@/types/api";

/**
 * Trajectory is a session-history signal, separate from the policy risk score. These helpers turn raw
 * backend values into display-ready facts. They never infer a value that the backend did not send:
 * a null trajectory score means "not evaluated or unavailable", and a null escalatedBy means
 * "not recorded" (a row written before escalation tracking). Neither is shown as "none".
 */

export const RISK_TIERS = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const satisfies readonly RiskTier[];

export const TRAJECTORY_TIER_LABELS: Record<RiskTier, string> = {
  LOW: "Low",
  MEDIUM: "Medium",
  HIGH: "High",
  CRITICAL: "Critical",
};

export const ESCALATION_SOURCES = [
  "NONE",
  "RISK_ENGINE",
  "TRAJECTORY",
  "INSPECTION",
] as const satisfies readonly EscalationSource[];

const RISK_TIER_SET: ReadonlySet<string> = new Set(RISK_TIERS);
const ESCALATION_SOURCE_SET: ReadonlySet<string> = new Set(ESCALATION_SOURCES);

/** Trajectory score bounds, matching the backend's 0-100 cap. */
const SCORE_MIN = 0;
const SCORE_MAX = 100;

/** A trajectory score is valid only when it is an integer in 0-100. Anything else is treated as absent. */
export function parseTrajectoryScore(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isInteger(value)) return null;
  return value >= SCORE_MIN && value <= SCORE_MAX ? value : null;
}

export function parseRiskTier(value: unknown): RiskTier | null {
  return typeof value === "string" && RISK_TIER_SET.has(value) ? (value as RiskTier) : null;
}

/** Null for anything that is not a known escalation source. Unknown values are not "none". */
export function parseEscalationSource(value: unknown): EscalationSource | null {
  return typeof value === "string" && ESCALATION_SOURCE_SET.has(value) ? (value as EscalationSource) : null;
}

/** Reason text trimmed. Empty or non-string input is null, so the UI does not render a blank line. */
export function parseTrajectoryReason(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

/**
 * What the trajectory stage said about one request.
 * - evaluated: the score is present. The tier and reason may still be absent if the backend sent none.
 * - not-evaluated: no valid score. Trajectory was skipped, failed, or was disabled, or the row is legacy.
 */
export type TrajectoryEvidence =
  | { kind: "evaluated"; score: number; tier: RiskTier | null; reason: string | null }
  | { kind: "not-evaluated" };

export function trajectoryEvidence(input: {
  trajectoryScore?: unknown;
  trajectoryTier?: unknown;
  trajectoryReason?: unknown;
}): TrajectoryEvidence {
  const score = parseTrajectoryScore(input.trajectoryScore);
  if (score === null) return { kind: "not-evaluated" };
  return {
    kind: "evaluated",
    score,
    tier: parseRiskTier(input.trajectoryTier),
    reason: parseTrajectoryReason(input.trajectoryReason),
  };
}

/**
 * Attribution for the stored escalatedBy value. Only TRAJECTORY credits trajectory. A REVIEW or DENY
 * that already existed is recorded as NONE, so it is never attributed to trajectory here.
 */
export type EscalationAttribution = "not-recorded" | "none" | "risk-engine" | "trajectory" | "inspection";

export function escalationAttribution(escalatedBy: unknown): EscalationAttribution {
  switch (parseEscalationSource(escalatedBy)) {
    case "TRAJECTORY":
      return "trajectory";
    case "RISK_ENGINE":
      return "risk-engine";
    case "INSPECTION":
      return "inspection";
    case "NONE":
      return "none";
    case null:
      return "not-recorded";
  }
}

export function isTrajectoryEscalation(escalatedBy: unknown): boolean {
  return escalationAttribution(escalatedBy) === "trajectory";
}

/** Plain-language attribution. Kept short, and it names the stage that changed the decision. */
export const ESCALATION_COPY: Record<EscalationAttribution, string> = {
  "not-recorded": "Not recorded (logged before escalation tracking)",
  none: "No escalation. The decision is the policy decision.",
  "risk-engine": "Raised by the Risk Engine.",
  trajectory: "Escalated to review by trajectory analysis.",
  inspection: "Decided by content inspection of the arguments.",
};

/** "60 / 100", or null when there is no score. */
export function formatTrajectoryScore(score: number | null): string | null {
  return score === null ? null : `${score} / ${SCORE_MAX}`;
}
