/**
 * Which gateway signal sent a request to review. Pure; tested in signal.test.ts.
 *
 * Since V11 the review row stores `escalatedBy`, the same value the gateway writes to the audit row:
 *   NONE → Policy (policy held it; no later stage changed the decision)
 *   RISK_ENGINE → Risk engine
 *   TRAJECTORY → Trajectory
 *   INSPECTION → Content inspection (V13: PII or prompt injection in the resource or arguments)
 *
 * `escalatedBy` is null only on reviews created before V11 whose audit row had no attribution. For those
 * old rows only, the signal is inferred from fields the review does store (GatewayService.escalationSource
 * and docs/api-design.md):
 * - originalDecision REVIEW: policy held it. The Risk Engine can only change a REVIEW to DENY (which never
 *   creates a review), and trajectory never escalates an existing REVIEW.
 * - originalDecision ALLOW: the gateway appended a fixed note to the reason, " Escalated to REVIEW by Risk
 *   Engine assessment (…)" or " Escalated to REVIEW by trajectory analysis (…)", which says which one.
 * Anything else is "UNKNOWN" (shown as "Not recorded"), never a guess.
 */
import { parseEscalationSource } from "@/lib/trajectory/model";
import type { AuditLogResponse, EscalationSource, ReviewRequestResponse } from "@/types/api";

export type ReviewSignal = "POLICY" | "RISK_ENGINE" | "TRAJECTORY" | "INSPECTION" | "UNKNOWN";

const RISK_ENGINE_NOTE = "Escalated to REVIEW by Risk Engine assessment";
const TRAJECTORY_NOTE = "Escalated to REVIEW by trajectory analysis";

export const REVIEW_SIGNAL_LABELS: Record<ReviewSignal, string> = {
  POLICY: "Policy",
  RISK_ENGINE: "Risk engine",
  TRAJECTORY: "Trajectory",
  INSPECTION: "Content inspection",
  UNKNOWN: "Not recorded",
};

const SIGNAL_BY_SOURCE: Record<EscalationSource, ReviewSignal> = {
  NONE: "POLICY",
  RISK_ENGINE: "RISK_ENGINE",
  TRAJECTORY: "TRAJECTORY",
  INSPECTION: "INSPECTION",
};

/** Text rule for old rows without a recorded escalatedBy. */
export function inferredSignal(review: Pick<ReviewRequestResponse, "originalDecision" | "reason">): ReviewSignal {
  if (review.originalDecision === "REVIEW") return "POLICY";
  if (review.originalDecision !== "ALLOW") return "UNKNOWN";
  if (review.reason.includes(TRAJECTORY_NOTE)) return "TRAJECTORY";
  if (review.reason.includes(RISK_ENGINE_NOTE)) return "RISK_ENGINE";
  return "UNKNOWN";
}

/**
 * Signal from the review record: its recorded escalatedBy first. The text rule runs only when the value is
 * null (an old row). A non-null value that is not a known source is "UNKNOWN", not inferred.
 */
export function reviewSignal(
  review: Pick<ReviewRequestResponse, "escalatedBy" | "originalDecision" | "reason">,
): ReviewSignal {
  if (review.escalatedBy === null || review.escalatedBy === undefined) return inferredSignal(review);
  const source = parseEscalationSource(review.escalatedBy);
  return source ? SIGNAL_BY_SOURCE[source] : "UNKNOWN";
}

/**
 * For the detail pane, which also has the audit row. Order: the review's own escalatedBy, then the audit
 * row's escalatedBy (also recorded, for the same request) when the review has none, then the text rule.
 */
export function resolvedSignal(
  review: Pick<ReviewRequestResponse, "escalatedBy" | "originalDecision" | "reason">,
  audit: Pick<AuditLogResponse, "decision" | "escalatedBy"> | undefined,
): ReviewSignal {
  if (review.escalatedBy === null && audit && audit.decision === "REVIEW" && audit.escalatedBy !== null) {
    return reviewSignal({ ...review, escalatedBy: audit.escalatedBy });
  }
  return reviewSignal(review);
}
