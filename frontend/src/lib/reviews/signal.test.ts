import { describe, expect, it } from "vitest";
import { resolvedSignal, reviewSignal } from "./signal";

const POLICY_REASON = "DELETE action on non-production resource requires human review.";
const RISK_REASON = "Action is within permitted policy bounds. Escalated to REVIEW by Risk Engine assessment (HIGH).";
const TRAJECTORY_REASON =
  "Action is within permitted policy bounds. Escalated to REVIEW by trajectory analysis (score 72, HIGH): burst of deletes.";

describe("reviewSignal", () => {
  it("policy REVIEW is attributed to policy", () => {
    expect(reviewSignal({ originalDecision: "REVIEW", reason: POLICY_REASON })).toBe("POLICY");
  });

  it("an escalated ALLOW is attributed by the gateway's recorded note", () => {
    expect(reviewSignal({ originalDecision: "ALLOW", reason: RISK_REASON })).toBe("RISK_ENGINE");
    expect(reviewSignal({ originalDecision: "ALLOW", reason: TRAJECTORY_REASON })).toBe("TRAJECTORY");
  });

  it("does not guess when an escalated ALLOW has no recognisable note", () => {
    expect(reviewSignal({ originalDecision: "ALLOW", reason: "Something else." })).toBe("UNKNOWN");
    expect(reviewSignal({ originalDecision: "DENY", reason: POLICY_REASON })).toBe("UNKNOWN");
  });
});

describe("resolvedSignal", () => {
  const review = { originalDecision: "ALLOW" as const, reason: "Something else." };

  it("prefers the audit row's recorded escalatedBy", () => {
    expect(
      resolvedSignal(review, { authorizationResult: "AUTHORIZED", decision: "REVIEW", escalatedBy: "TRAJECTORY" }),
    ).toBe("TRAJECTORY");
    expect(
      resolvedSignal(review, { authorizationResult: "AUTHORIZED", decision: "REVIEW", escalatedBy: "RISK_ENGINE" }),
    ).toBe("RISK_ENGINE");
  });

  it("falls back to the review record without an audit row or with a pre-V9 row", () => {
    expect(resolvedSignal(review, undefined)).toBe("UNKNOWN");
    expect(
      resolvedSignal({ originalDecision: "REVIEW", reason: POLICY_REASON }, { authorizationResult: "AUTHORIZED", decision: "REVIEW", escalatedBy: null }),
    ).toBe("POLICY");
  });
});
