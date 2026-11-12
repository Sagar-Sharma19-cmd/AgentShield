import { describe, expect, it } from "vitest";
import type { EscalationSource } from "@/types/api";
import { inferredSignal, resolvedSignal, reviewSignal } from "./signal";

const POLICY_REASON = "DELETE action on non-production resource requires human review.";
const RISK_REASON = "Action is within permitted policy bounds. Escalated to REVIEW by Risk Engine assessment (HIGH).";
const TRAJECTORY_REASON =
  "Action is within permitted policy bounds. Escalated to REVIEW by trajectory analysis (score 72, HIGH): burst of deletes.";

function review(escalatedBy: EscalationSource | null, originalDecision: "ALLOW" | "REVIEW" = "ALLOW", reason = "Something else.") {
  return { escalatedBy, originalDecision, reason };
}

describe("reviewSignal: recorded escalatedBy (V11)", () => {
  it("maps each recorded source to its signal", () => {
    expect(reviewSignal(review("NONE", "REVIEW"))).toBe("POLICY");
    expect(reviewSignal(review("RISK_ENGINE"))).toBe("RISK_ENGINE");
    expect(reviewSignal(review("TRAJECTORY"))).toBe("TRAJECTORY");
    expect(reviewSignal(review("INSPECTION"))).toBe("INSPECTION");
  });

  it("uses the recorded value even when the reason text says something else", () => {
    expect(reviewSignal(review("RISK_ENGINE", "ALLOW", TRAJECTORY_REASON))).toBe("RISK_ENGINE");
    expect(reviewSignal(review("TRAJECTORY", "ALLOW", RISK_REASON))).toBe("TRAJECTORY");
  });

  it("shows an unknown recorded value as Not recorded rather than inferring", () => {
    const odd = { escalatedBy: "SOMETHING_NEW" as unknown as EscalationSource, originalDecision: "ALLOW" as const, reason: TRAJECTORY_REASON };
    expect(reviewSignal(odd)).toBe("UNKNOWN");
  });
});

describe("reviewSignal: old rows (escalatedBy null) fall back to the text rule", () => {
  it("policy REVIEW is attributed to policy", () => {
    expect(reviewSignal(review(null, "REVIEW", POLICY_REASON))).toBe("POLICY");
  });

  it("an escalated ALLOW is attributed by the gateway's recorded note", () => {
    expect(reviewSignal(review(null, "ALLOW", RISK_REASON))).toBe("RISK_ENGINE");
    expect(reviewSignal(review(null, "ALLOW", TRAJECTORY_REASON))).toBe("TRAJECTORY");
  });

  it("does not guess when there is no recognisable note", () => {
    expect(reviewSignal(review(null, "ALLOW", "Something else."))).toBe("UNKNOWN");
    expect(inferredSignal({ originalDecision: "DENY", reason: POLICY_REASON })).toBe("UNKNOWN");
  });
});

describe("resolvedSignal", () => {
  const auditRow = (escalatedBy: EscalationSource | null) => ({ decision: "REVIEW" as const, escalatedBy });

  it("prefers the review's own recorded value over the audit row", () => {
    expect(resolvedSignal(review("RISK_ENGINE"), auditRow("TRAJECTORY"))).toBe("RISK_ENGINE");
  });

  it("uses the audit row's escalatedBy for an old review row without one", () => {
    expect(resolvedSignal(review(null), auditRow("TRAJECTORY"))).toBe("TRAJECTORY");
    expect(resolvedSignal(review(null), auditRow("NONE"))).toBe("POLICY");
  });

  it("falls back to the text rule when neither is recorded", () => {
    expect(resolvedSignal(review(null, "ALLOW", RISK_REASON), undefined)).toBe("RISK_ENGINE");
    expect(resolvedSignal(review(null, "REVIEW", POLICY_REASON), auditRow(null))).toBe("POLICY");
    expect(resolvedSignal(review(null), auditRow(null))).toBe("UNKNOWN");
  });
});
