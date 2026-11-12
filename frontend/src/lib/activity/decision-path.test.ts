import { describe, expect, it } from "vitest";
import type { AuthorizationResult, DecisionType, EscalationSource } from "@/types/api";
import { decidingStepIndex, decisionPath, STEP_STATUS_LABELS, type PathInput, type ReviewOutcome, type StepStatus } from "./decision-path";

function row(
  authorizationResult: AuthorizationResult,
  decision: DecisionType,
  escalatedBy: EscalationSource | null = "NONE",
  trajectoryScore: number | null = null,
): PathInput {
  return {
    authorizationResult,
    decision,
    escalatedBy,
    trajectoryScore,
    authorizationReason: "auth reason",
    reason: "decision reason",
  };
}

const statuses = (input: PathInput): StepStatus[] => decisionPath(input).map((step) => step.status);

describe("decisionPath", () => {
  it("always returns the seven gates in pipeline order with exactly one deciding step", () => {
    const cases = [
      row("AGENT_REVOKED", "DENY"),
      row("UNAUTHORIZED", "DENY"),
      row("AUTHORIZED", "DENY"),
      row("AUTHORIZED", "REVIEW"),
      row("AUTHORIZED", "REVIEW", null),
      row("AUTHORIZED", "DENY", "RISK_ENGINE"),
      row("AUTHORIZED", "REVIEW", "RISK_ENGINE", 10),
      row("AUTHORIZED", "REVIEW", "TRAJECTORY", 70),
      row("AUTHORIZED", "ALLOW", "NONE", 20),
    ];
    for (const input of cases) {
      const path = decisionPath(input);
      expect(path.map((step) => step.gate)).toEqual([
        "IDENTITY",
        "PERMISSION",
        "INSPECTION",
        "POLICY",
        "RISK_ENGINE",
        "TRAJECTORY",
        "PASSED",
      ]);
      expect(path.filter((step) => step.status === "decided")).toHaveLength(1);
      expect(path[decidingStepIndex(input)].status).toBe("decided");
      for (const step of path) expect(step.note.length).toBeGreaterThan(0);
    }
  });

  it("identity failure: decided at identity with the authorization reason, nothing after reached", () => {
    const path = decisionPath(row("AGENT_SUSPENDED", "DENY"));
    expect(path.map((step) => step.status)).toEqual(["decided", "not-reached", "not-reached", "not-reached", "not-reached", "not-reached", "not-reached"]);
    expect(path[0].detail).toEqual({ kind: "authorization-reason", text: "auth reason" });
  });

  it("permission failure: identity passed, decided at permission, rest not reached", () => {
    const path = decisionPath(row("TOOL_DISABLED", "DENY"));
    expect(path.map((step) => step.status)).toEqual(["passed", "decided", "not-reached", "not-reached", "not-reached", "not-reached", "not-reached"]);
    expect(path[1].detail).toEqual({ kind: "authorization-reason", text: "auth reason" });
  });

  it("policy DENY: Risk Engine and trajectory not reached", () => {
    const path = decisionPath(row("AUTHORIZED", "DENY", "NONE"));
    expect(path.map((step) => step.status)).toEqual(["passed", "passed", "not-recorded", "decided", "not-reached", "not-reached", "not-reached"]);
    expect(path[3].detail).toEqual({ kind: "reason", text: "decision reason" });
    expect(path[3].note).toMatch(/denied/);
  });

  it("policy REVIEW: the Risk Engine was consulted without change; trajectory checked when scored", () => {
    expect(statuses(row("AUTHORIZED", "REVIEW", "NONE", 15))).toEqual(["passed", "passed", "not-recorded", "decided", "evaluated", "evaluated", "not-reached"]);
    const path = decisionPath(row("AUTHORIZED", "REVIEW", "NONE", 15));
    expect(path[3].note).toMatch(/review/);
    expect(path[5].note).toMatch(/15 \/ 100/);
  });

  it("policy REVIEW without a trajectory score: trajectory not recorded", () => {
    expect(statuses(row("AUTHORIZED", "REVIEW", "NONE", null))).toEqual([
      "passed",
      "passed",
      "not-recorded",
      "decided",
      "evaluated",
      "not-recorded",
      "not-reached",
    ]);
  });

  it("pre-V9 REVIEW (null escalatedBy): the Risk Engine's effect is not recorded", () => {
    const path = decisionPath(row("AUTHORIZED", "REVIEW", null));
    expect(path[3].status).toBe("decided");
    expect(path[4].status).toBe("not-recorded");
  });

  it("pre-V9 DENY (null escalatedBy) is attributed to policy", () => {
    expect(statuses(row("AUTHORIZED", "DENY", null))).toEqual(["passed", "passed", "not-recorded", "decided", "not-reached", "not-reached", "not-reached"]);
  });

  it("Risk Engine DENY: policy passed with an honest note, trajectory not reached", () => {
    const path = decisionPath(row("AUTHORIZED", "DENY", "RISK_ENGINE"));
    expect(path.map((step) => step.status)).toEqual(["passed", "passed", "not-recorded", "passed", "decided", "not-reached", "not-reached"]);
    expect(path[3].note).toMatch(/does not say/);
    expect(path[4].detail).toEqual({ kind: "reason", text: "decision reason" });
    expect(path[4].note).toMatch(/DENY/);
  });

  it("Risk Engine REVIEW: policy allowed it; trajectory checked when scored", () => {
    const path = decisionPath(row("AUTHORIZED", "REVIEW", "RISK_ENGINE", 30));
    expect(path.map((step) => step.status)).toEqual(["passed", "passed", "not-recorded", "passed", "decided", "evaluated", "not-reached"]);
    expect(path[3].note).toBe("Policy allowed the request.");
    expect(path[4].note).toMatch(/review/);
  });

  it("trajectory REVIEW: earlier gates passed, decided at trajectory with trajectory detail", () => {
    const path = decisionPath(row("AUTHORIZED", "REVIEW", "TRAJECTORY", 72));
    expect(path.map((step) => step.status)).toEqual(["passed", "passed", "not-recorded", "passed", "passed", "decided", "not-reached"]);
    expect(path[5].detail).toEqual({ kind: "trajectory", text: "decision reason" });
    expect(path[6].note).toMatch(/held for review/);
  });

  it("ALLOW: every gate passed and the final step decides, with the trajectory score in context", () => {
    const below = decisionPath(row("AUTHORIZED", "ALLOW", "NONE", 20));
    expect(below.map((step) => step.status)).toEqual(["passed", "passed", "not-recorded", "passed", "passed", "passed", "decided"]);
    expect(below[5].note).toMatch(/below the HIGH threshold/);
    expect(below[6].detail).toEqual({ kind: "reason", text: "decision reason" });

    const unscored = decisionPath(row("AUTHORIZED", "ALLOW", null, null));
    expect(unscored[5].note).toMatch(/No trajectory score/);
  });

  it("inspection DENY (secret): decided at inspection; policy, Risk Engine and trajectory not reached", () => {
    const path = decisionPath({ ...row("AUTHORIZED", "DENY", "INSPECTION"), inspectionVerdict: "DENY" });
    expect(path.map((step) => step.status)).toEqual(["passed", "passed", "decided", "not-reached", "not-reached", "not-reached", "not-reached"]);
    expect(path[2].note).toMatch(/secret/);
    expect(path[2].detail).toEqual({ kind: "reason", text: "decision reason" });
    expect(path[4].note).toMatch(/never consulted after a content inspection DENY/);
  });

  it("inspection REVIEW (personal data): decided at inspection; policy allowed, Risk Engine consulted", () => {
    const path = decisionPath({ ...row("AUTHORIZED", "REVIEW", "INSPECTION", 12), inspectionVerdict: "REVIEW" });
    expect(path.map((step) => step.status)).toEqual(["passed", "passed", "decided", "passed", "evaluated", "evaluated", "not-reached"]);
    expect(path[2].note).toMatch(/held the request for review/);
    expect(decidingStepIndex({ ...row("AUTHORIZED", "REVIEW", "INSPECTION"), inspectionVerdict: "REVIEW" })).toBe(2);
  });

  it("CLEAN inspection is passed; a null verdict is not recorded", () => {
    expect(statuses({ ...row("AUTHORIZED", "ALLOW", "NONE", 5), inspectionVerdict: "CLEAN" })[2]).toBe("passed");
    expect(statuses({ ...row("AUTHORIZED", "ALLOW", "NONE", 5), inspectionVerdict: null })[2]).toBe("not-recorded");
  });

  it("inspection flagged REVIEW but policy already held it: inspection evaluated, policy decided", () => {
    const path = decisionPath({ ...row("AUTHORIZED", "REVIEW", "NONE", 5), inspectionVerdict: "REVIEW" });
    expect(path[2].status).toBe("evaluated");
    expect(path[3].status).toBe("decided");
  });

  it("authorization failure: inspection not reached", () => {
    expect(statuses(row("TOOL_DISABLED", "DENY"))[2]).toBe("not-reached");
  });

  it("labels every status", () => {
    for (const label of Object.values(STEP_STATUS_LABELS)) expect(label.length).toBeGreaterThan(0);
  });
});

describe("decisionPath with a review outcome (review detail panel)", () => {
  const held = row("AUTHORIZED", "REVIEW", "NONE", 10);
  const outcome = (status: ReviewOutcome["status"], claimed: boolean, expired: boolean, reviewer: string | null = "sagar"): PathInput => ({
    ...held,
    reviewOutcome: { status, reviewer, claimed, expired },
  });
  const last = (input: PathInput) => decisionPath(input)[6];

  it("APPROVED and claimed: decided after review", () => {
    expect(last(outcome("APPROVED", true, false))).toEqual({
      gate: "PASSED",
      status: "decided-after-review",
      note: "Approved by sagar, then claimed once by the agent.",
    });
    // Claimed counts even once the review window has passed.
    expect(last(outcome("APPROVED", true, true)).status).toBe("decided-after-review");
  });

  it("APPROVED, not claimed, not expired: waiting for the claim", () => {
    expect(last(outcome("APPROVED", false, false))).toMatchObject({
      status: "not-reached",
      note: "Approved by sagar. Waiting for the agent to claim it.",
    });
  });

  it("APPROVED, not claimed, expired: nothing ran", () => {
    expect(last(outcome("APPROVED", false, true)).note).toBe("Approved by sagar, but the approval expired unclaimed. Nothing ran.");
  });

  it("REJECTED: nothing ran", () => {
    expect(last(outcome("REJECTED", false, false))).toMatchObject({ status: "not-reached", note: "Rejected by sagar. Nothing ran." });
  });

  it("PENDING or IN_REVIEW: the current hold text", () => {
    const hold = last(held);
    expect(last(outcome("PENDING", false, false))).toEqual(hold);
    expect(last(outcome("IN_REVIEW", false, false))).toEqual(hold);
    expect(hold.note).toBe("Not allowed yet: the request is held for review.");
  });

  it("PENDING after expiry: expired before anyone decided", () => {
    expect(last(outcome("PENDING", false, true))).toMatchObject({
      status: "not-reached",
      note: "Expired before anyone decided. Nothing ran.",
    });
    expect(last(outcome("IN_REVIEW", false, true)).note).toBe("Expired before anyone decided. Nothing ran.");
  });

  it("names an operator when the reviewer was not recorded", () => {
    expect(last(outcome("REJECTED", false, false, null)).note).toBe("Rejected by an operator. Nothing ran.");
    expect(last(outcome("APPROVED", true, false, "  ")).note).toBe("Approved by an operator, then claimed once by the agent.");
  });

  it("leaves the first five steps, and the single deciding gate, unchanged", () => {
    const base = decisionPath(held);
    for (const input of [outcome("APPROVED", true, false), outcome("REJECTED", false, false), outcome("PENDING", false, true)]) {
      const path = decisionPath(input);
      expect(path.slice(0, 5)).toEqual(base.slice(0, 5));
      expect(path.filter((step) => step.status === "decided")).toHaveLength(1);
      expect(decidingStepIndex(input)).toBe(decidingStepIndex(held));
    }
  });

  it("without an outcome (Activity rows) the path is exactly as before; an outcome never changes ALLOW or DENY", () => {
    expect(decisionPath(held)[6].note).toBe("Not allowed yet: the request is held for review.");
    const allow = row("AUTHORIZED", "ALLOW", "NONE", 20);
    const deny = row("AUTHORIZED", "DENY", "NONE");
    const approved = { status: "APPROVED" as const, reviewer: "sagar", claimed: true, expired: false };
    expect(decisionPath({ ...allow, reviewOutcome: approved })).toEqual(decisionPath(allow));
    expect(decisionPath({ ...deny, reviewOutcome: approved })).toEqual(decisionPath(deny));
  });

  it("labels the new status", () => {
    expect(STEP_STATUS_LABELS["decided-after-review"]).toBe("Decided after review");
  });
});
