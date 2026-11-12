/**
 * "Decision path" for one audit row: what each of the six gates did, as far as the recorded fields
 * (authorizationResult, decision, escalatedBy, trajectoryScore) and the documented pipeline rules allow us
 * to say. Pure; tested in decision-path.test.ts.
 *
 * Pipeline rules used (docs/architecture.md, "Authorization flow"):
 * - An authorization failure (identity or permission) stops evaluation: nothing after it runs.
 * - The Risk Engine is consulted only for a policy ALLOW or REVIEW, never after a DENY. It only escalates.
 * - Trajectory runs only when the decision is not DENY. It only escalates ALLOW to REVIEW.
 * - escalatedBy records which stage changed the decision (null on rows written before V9).
 *
 * Where the record cannot tell (for example, what the policy said before the Risk Engine escalated to DENY),
 * the step says so instead of guessing.
 */
import { GATE_INDEX, GATES, gateFor, HIGH_RISK_THRESHOLD, type Gate } from "@/lib/checkpoint/gates";
import type { AuditLogResponse, ReviewStatus } from "@/types/api";

export type StepStatus =
  /** The request got through this gate. */
  | "passed"
  /** This gate set the final decision. */
  | "decided"
  /** The gate ran after the decision was set and did not change it. */
  | "evaluated"
  /** The gate did not run for this request. */
  | "not-reached"
  /** The record cannot say whether or how this gate ran. */
  | "not-recorded"
  /** Held for review, then approved by an operator and claimed once by the agent (review detail only). */
  | "decided-after-review";

export const STEP_STATUS_LABELS: Record<StepStatus, string> = {
  passed: "Passed",
  decided: "Decided here",
  evaluated: "Checked, no change",
  "not-reached": "Not reached",
  "not-recorded": "Not recorded",
  "decided-after-review": "Decided after review",
};

/** Which recorded field explains the deciding gate. */
export type StepDetail =
  | { kind: "authorization-reason"; text: string }
  | { kind: "reason"; text: string }
  | { kind: "trajectory"; text: string };

export interface PathStep {
  gate: Gate;
  status: StepStatus;
  /** One short sentence describing what happened at this gate. */
  note: string;
  /** Present on the deciding step only. */
  detail?: StepDetail;
}

/**
 * What happened to the review a REVIEW row created. Only the review detail panel knows this; Activity rows
 * leave it out and keep the hold wording.
 */
export interface ReviewOutcome {
  status: ReviewStatus;
  reviewer: string | null;
  /** The agent claimed the approval (consumedAt is set). */
  claimed: boolean;
  /** Effectively expired (lib/reviews/expiry.ts isEffectivelyExpired). */
  expired: boolean;
}

export type PathInput = Pick<
  AuditLogResponse,
  "authorizationResult" | "authorizationReason" | "decision" | "escalatedBy" | "reason" | "trajectoryScore"
> & { reviewOutcome?: ReviewOutcome };

function trajectoryNote(score: number | null): string {
  if (score === null) return "No trajectory score was recorded for this request.";
  return score >= HIGH_RISK_THRESHOLD
    ? `Trajectory score ${score} / 100, at or above the HIGH threshold (${HIGH_RISK_THRESHOLD}).`
    : `Trajectory score ${score} / 100, below the HIGH threshold (${HIGH_RISK_THRESHOLD}).`;
}

function identityStep(decided: Gate, row: PathInput): PathStep {
  if (decided === "IDENTITY") {
    return {
      gate: "IDENTITY",
      status: "decided",
      note: "The agent identity check failed.",
      detail: { kind: "authorization-reason", text: row.authorizationReason },
    };
  }
  return { gate: "IDENTITY", status: "passed", note: "Agent found, active and matching its API key." };
}

function permissionStep(decided: Gate, row: PathInput): PathStep {
  if (decided === "IDENTITY") return { gate: "PERMISSION", status: "not-reached", note: "Evaluation stopped at identity." };
  if (decided === "PERMISSION") {
    return {
      gate: "PERMISSION",
      status: "decided",
      note: "The tool or permission check failed.",
      detail: { kind: "authorization-reason", text: row.authorizationReason },
    };
  }
  return { gate: "PERMISSION", status: "passed", note: "Tool active and the agent's grant allows this action." };
}

function policyStep(decided: Gate, row: PathInput): PathStep {
  if (decided === "IDENTITY" || decided === "PERMISSION") {
    return { gate: "POLICY", status: "not-reached", note: "Authorization failed, so policy was not evaluated." };
  }
  if (decided === "POLICY") {
    return {
      gate: "POLICY",
      status: "decided",
      note: row.decision === "DENY" ? "Policy denied the request." : "Policy held the request for review.",
      detail: { kind: "reason", text: row.reason },
    };
  }
  if (decided === "RISK_ENGINE" && row.decision === "DENY") {
    // The Risk Engine escalated to DENY from either ALLOW or REVIEW; the row does not record which.
    return {
      gate: "POLICY",
      status: "passed",
      note: "Policy did not deny. The record does not say whether it allowed the request or held it for review.",
    };
  }
  // Final ALLOW, a trajectory REVIEW, or a Risk Engine REVIEW: escalation only raises, so policy allowed it.
  return { gate: "POLICY", status: "passed", note: "Policy allowed the request." };
}

function riskEngineStep(decided: Gate, row: PathInput): PathStep {
  if (decided === "IDENTITY" || decided === "PERMISSION") {
    return { gate: "RISK_ENGINE", status: "not-reached", note: "Authorization failed, so the Risk Engine was not consulted." };
  }
  if (decided === "POLICY") {
    if (row.decision === "DENY") {
      return { gate: "RISK_ENGINE", status: "not-reached", note: "The Risk Engine is never consulted after a policy DENY." };
    }
    if (row.escalatedBy === null) {
      return {
        gate: "RISK_ENGINE",
        status: "not-recorded",
        note: "This row was logged before escalation tracking, so the Risk Engine's effect is not recorded.",
      };
    }
    return {
      gate: "RISK_ENGINE",
      status: "evaluated",
      note: "Consulted for the review and did not raise it. Its score is not stored on the audit row.",
    };
  }
  if (decided === "RISK_ENGINE") {
    return {
      gate: "RISK_ENGINE",
      status: "decided",
      note: row.decision === "DENY" ? "The Risk Engine escalated the request to DENY." : "The Risk Engine escalated the request to review.",
      detail: { kind: "reason", text: row.reason },
    };
  }
  return { gate: "RISK_ENGINE", status: "passed", note: "The Risk Engine did not raise the decision." };
}

function trajectoryStep(decided: Gate, row: PathInput): PathStep {
  if (decided === "IDENTITY" || decided === "PERMISSION") {
    return { gate: "TRAJECTORY", status: "not-reached", note: "Authorization failed, so trajectory was not evaluated." };
  }
  if (decided === "TRAJECTORY") {
    return {
      gate: "TRAJECTORY",
      status: "decided",
      note: "Session history escalated an allowed request to review.",
      detail: { kind: "trajectory", text: row.reason },
    };
  }
  if (decided === "PASSED") {
    return { gate: "TRAJECTORY", status: "passed", note: trajectoryNote(row.trajectoryScore) };
  }
  // Decided earlier at Policy or the Risk Engine.
  if (row.decision === "DENY") {
    return { gate: "TRAJECTORY", status: "not-reached", note: "Trajectory analysis does not run once the decision is DENY." };
  }
  if (row.trajectoryScore === null) {
    return { gate: "TRAJECTORY", status: "not-recorded", note: "No trajectory score was recorded for this request." };
  }
  return {
    gate: "TRAJECTORY",
    status: "evaluated",
    note: `${trajectoryNote(row.trajectoryScore)} It can only escalate an ALLOW, so the review stood.`,
  };
}

/** The decision step of a held request once its review outcome is known; null keeps the hold wording. */
function reviewedDecisionStep(outcome: ReviewOutcome): PathStep | null {
  const who = outcome.reviewer?.trim() || "an operator";
  switch (outcome.status) {
    case "APPROVED":
      if (outcome.claimed) {
        return { gate: "PASSED", status: "decided-after-review", note: `Approved by ${who}, then claimed once by the agent.` };
      }
      return outcome.expired
        ? { gate: "PASSED", status: "not-reached", note: `Approved by ${who}, but the approval expired unclaimed. Nothing ran.` }
        : { gate: "PASSED", status: "not-reached", note: `Approved by ${who}. Waiting for the agent to claim it.` };
    case "REJECTED":
      return { gate: "PASSED", status: "not-reached", note: `Rejected by ${who}. Nothing ran.` };
    case "PENDING":
    case "IN_REVIEW":
      // An open review that expired can no longer be decided.
      return outcome.expired ? { gate: "PASSED", status: "not-reached", note: "Expired before anyone decided. Nothing ran." } : null;
  }
}

function decisionStep(decided: Gate, row: PathInput): PathStep {
  if (decided === "PASSED") {
    return { gate: "PASSED", status: "decided", note: "Allowed.", detail: { kind: "reason", text: row.reason } };
  }
  if (row.decision === "REVIEW" && row.reviewOutcome) {
    const reviewed = reviewedDecisionStep(row.reviewOutcome);
    if (reviewed) return reviewed;
  }
  return {
    gate: "PASSED",
    status: "not-reached",
    note: row.decision === "DENY" ? "Not allowed: the request was denied." : "Not allowed yet: the request is held for review.",
  };
}

/**
 * The six steps in pipeline order. Exactly one step is "decided". With an approved and claimed review outcome,
 * the final step is additionally "decided-after-review".
 */
export function decisionPath(row: PathInput): PathStep[] {
  const decided = gateFor(row);
  return [
    identityStep(decided, row),
    permissionStep(decided, row),
    policyStep(decided, row),
    riskEngineStep(decided, row),
    trajectoryStep(decided, row),
    decisionStep(decided, row),
  ];
}

/** Index of the deciding step, for scrolling or focusing it. */
export function decidingStepIndex(row: PathInput): number {
  return GATE_INDEX[gateFor(row)];
}

export { GATES as PATH_GATES };
