import { describe, expect, it } from "vitest";
import type { AuthorizationResult, DecisionType, EscalationSource } from "@/types/api";
import { decidingStepIndex, decisionPath, STEP_STATUS_LABELS, type PathInput, type StepStatus } from "./decision-path";

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
  it("always returns the six gates in pipeline order with exactly one deciding step", () => {
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
      expect(path.map((step) => step.gate)).toEqual(["IDENTITY", "PERMISSION", "POLICY", "RISK_ENGINE", "TRAJECTORY", "PASSED"]);
      expect(path.filter((step) => step.status === "decided")).toHaveLength(1);
      expect(path[decidingStepIndex(input)].status).toBe("decided");
      for (const step of path) expect(step.note.length).toBeGreaterThan(0);
    }
  });

  it("identity failure: decided at identity with the authorization reason, nothing after reached", () => {
    const path = decisionPath(row("AGENT_SUSPENDED", "DENY"));
    expect(path.map((step) => step.status)).toEqual(["decided", "not-reached", "not-reached", "not-reached", "not-reached", "not-reached"]);
    expect(path[0].detail).toEqual({ kind: "authorization-reason", text: "auth reason" });
  });

  it("permission failure: identity passed, decided at permission, rest not reached", () => {
    const path = decisionPath(row("TOOL_DISABLED", "DENY"));
    expect(path.map((step) => step.status)).toEqual(["passed", "decided", "not-reached", "not-reached", "not-reached", "not-reached"]);
    expect(path[1].detail).toEqual({ kind: "authorization-reason", text: "auth reason" });
  });

  it("policy DENY: Risk Engine and trajectory not reached", () => {
    const path = decisionPath(row("AUTHORIZED", "DENY", "NONE"));
    expect(path.map((step) => step.status)).toEqual(["passed", "passed", "decided", "not-reached", "not-reached", "not-reached"]);
    expect(path[2].detail).toEqual({ kind: "reason", text: "decision reason" });
    expect(path[2].note).toMatch(/denied/);
  });

  it("policy REVIEW: the Risk Engine was consulted without change; trajectory checked when scored", () => {
    expect(statuses(row("AUTHORIZED", "REVIEW", "NONE", 15))).toEqual(["passed", "passed", "decided", "evaluated", "evaluated", "not-reached"]);
    const path = decisionPath(row("AUTHORIZED", "REVIEW", "NONE", 15));
    expect(path[2].note).toMatch(/review/);
    expect(path[4].note).toMatch(/15 \/ 100/);
  });

  it("policy REVIEW without a trajectory score: trajectory not recorded", () => {
    expect(statuses(row("AUTHORIZED", "REVIEW", "NONE", null))).toEqual([
      "passed",
      "passed",
      "decided",
      "evaluated",
      "not-recorded",
      "not-reached",
    ]);
  });

  it("pre-V9 REVIEW (null escalatedBy): the Risk Engine's effect is not recorded", () => {
    const path = decisionPath(row("AUTHORIZED", "REVIEW", null));
    expect(path[2].status).toBe("decided");
    expect(path[3].status).toBe("not-recorded");
  });

  it("pre-V9 DENY (null escalatedBy) is attributed to policy", () => {
    expect(statuses(row("AUTHORIZED", "DENY", null))).toEqual(["passed", "passed", "decided", "not-reached", "not-reached", "not-reached"]);
  });

  it("Risk Engine DENY: policy passed with an honest note, trajectory not reached", () => {
    const path = decisionPath(row("AUTHORIZED", "DENY", "RISK_ENGINE"));
    expect(path.map((step) => step.status)).toEqual(["passed", "passed", "passed", "decided", "not-reached", "not-reached"]);
    expect(path[2].note).toMatch(/does not say/);
    expect(path[3].detail).toEqual({ kind: "reason", text: "decision reason" });
    expect(path[3].note).toMatch(/DENY/);
  });

  it("Risk Engine REVIEW: policy allowed it; trajectory checked when scored", () => {
    const path = decisionPath(row("AUTHORIZED", "REVIEW", "RISK_ENGINE", 30));
    expect(path.map((step) => step.status)).toEqual(["passed", "passed", "passed", "decided", "evaluated", "not-reached"]);
    expect(path[2].note).toBe("Policy allowed the request.");
    expect(path[3].note).toMatch(/review/);
  });

  it("trajectory REVIEW: earlier gates passed, decided at trajectory with trajectory detail", () => {
    const path = decisionPath(row("AUTHORIZED", "REVIEW", "TRAJECTORY", 72));
    expect(path.map((step) => step.status)).toEqual(["passed", "passed", "passed", "passed", "decided", "not-reached"]);
    expect(path[4].detail).toEqual({ kind: "trajectory", text: "decision reason" });
    expect(path[5].note).toMatch(/held for review/);
  });

  it("ALLOW: every gate passed and the final step decides, with the trajectory score in context", () => {
    const below = decisionPath(row("AUTHORIZED", "ALLOW", "NONE", 20));
    expect(below.map((step) => step.status)).toEqual(["passed", "passed", "passed", "passed", "passed", "decided"]);
    expect(below[4].note).toMatch(/below the HIGH threshold/);
    expect(below[5].detail).toEqual({ kind: "reason", text: "decision reason" });

    const unscored = decisionPath(row("AUTHORIZED", "ALLOW", null, null));
    expect(unscored[4].note).toMatch(/No trajectory score/);
  });

  it("labels every status", () => {
    for (const label of Object.values(STEP_STATUS_LABELS)) expect(label.length).toBeGreaterThan(0);
  });
});
