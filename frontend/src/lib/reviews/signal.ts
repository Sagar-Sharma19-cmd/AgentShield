/**
 * Which gateway signal sent a request to review. Pure; tested in signal.test.ts.
 *
 * Review rows do not store `escalatedBy`, so the queue derives the signal from fields the review DOES
 * store, using the gateway's documented rules (GatewayService.escalationSource and docs/api-design.md):
 *
 * - originalDecision REVIEW: policy held it. The Risk Engine did not change it (a change from REVIEW can
 *   only be to DENY, which never creates a review), and trajectory never escalates an existing REVIEW.
 * - originalDecision ALLOW: a later stage raised it to REVIEW, either the Risk Engine or trajectory.
 *   The gateway appends a fixed note to the reason, " Escalated to REVIEW by Risk Engine assessment (…)"
 *   or " Escalated to REVIEW by trajectory analysis (…)", which says which one.
 *   If neither note is present, the signal is "UNKNOWN" rather than a guess.
 *
 * The detail pane prefers the audit row's recorded `escalatedBy` (via gateFor) when it is available.
 */
import { gateFor, type Gate } from "@/lib/checkpoint/gates";
import type { AuditLogResponse, ReviewRequestResponse } from "@/types/api";

export type ReviewSignal = Extract<Gate, "POLICY" | "RISK_ENGINE" | "TRAJECTORY"> | "UNKNOWN";

const RISK_ENGINE_NOTE = "Escalated to REVIEW by Risk Engine assessment";
const TRAJECTORY_NOTE = "Escalated to REVIEW by trajectory analysis";

export const REVIEW_SIGNAL_LABELS: Record<ReviewSignal, string> = {
  POLICY: "Policy",
  RISK_ENGINE: "Risk engine",
  TRAJECTORY: "Trajectory",
  UNKNOWN: "Not recorded",
};

/** Signal from the review record alone. */
export function reviewSignal(review: Pick<ReviewRequestResponse, "originalDecision" | "reason">): ReviewSignal {
  if (review.originalDecision === "REVIEW") return "POLICY";
  if (review.originalDecision !== "ALLOW") return "UNKNOWN";
  if (review.reason.includes(TRAJECTORY_NOTE)) return "TRAJECTORY";
  if (review.reason.includes(RISK_ENGINE_NOTE)) return "RISK_ENGINE";
  return "UNKNOWN";
}

/**
 * Signal from the audit row when it is a REVIEW row, otherwise from the review record. The audit row's
 * escalatedBy is the recorded attribution, so it wins whenever it maps to one of the three signals.
 */
export function resolvedSignal(
  review: Pick<ReviewRequestResponse, "originalDecision" | "reason">,
  audit: Pick<AuditLogResponse, "authorizationResult" | "decision" | "escalatedBy"> | undefined,
): ReviewSignal {
  if (audit && audit.decision === "REVIEW" && audit.escalatedBy !== null) {
    const gate = gateFor(audit);
    if (gate === "POLICY" || gate === "RISK_ENGINE" || gate === "TRAJECTORY") return gate;
  }
  return reviewSignal(review);
}
