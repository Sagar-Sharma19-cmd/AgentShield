import { describe, expect, it } from "vitest";
import { toAlert } from "./model";

const BASE = {
  requestId: "req-1",
  agentId: "agent-a",
  tool: "jenkins",
  action: "EXECUTE",
  resource: "pipeline/deploy",
  reason: "Policy requires review",
  riskScore: 60,
  authorizationResult: "AUTHORIZED",
  timestamp: "2026-11-02T10:00:00Z",
};

describe("toAlert trajectory fields", () => {
  it("ALLOW is not an alert, so trajectory evaluated with no escalation produces no alert", () => {
    expect(toAlert({ ...BASE, decision: "ALLOW", escalatedBy: "NONE", trajectoryScore: 20, trajectoryTier: "LOW" })).toBeNull();
  });

  it("ALLOW escalated to REVIEW by trajectory keeps the trajectory tier, score, reason and attribution", () => {
    const alert = toAlert({
      ...BASE,
      decision: "REVIEW",
      riskScore: 10,
      reason: "Escalated to REVIEW by trajectory analysis (score 60, HIGH): DENIAL_DENSITY: 2 recent denials",
      escalatedBy: "TRAJECTORY",
      trajectoryScore: 60,
      trajectoryTier: "HIGH",
      trajectoryReason: "DENIAL_DENSITY: 2 recent denials",
    });

    expect(alert).not.toBeNull();
    expect(alert?.decision).toBe("REVIEW");
    expect(alert?.escalatedBy).toBe("TRAJECTORY");
    expect(alert?.trajectoryScore).toBe(60);
    expect(alert?.trajectoryTier).toBe("HIGH");
    expect(alert?.trajectoryReason).toBe("DENIAL_DENSITY: 2 recent denials");
    expect(alert?.policyRiskScore).toBe(10);
  });

  it("REVIEW caused by the Risk Engine keeps RISK_ENGINE attribution and does not claim trajectory", () => {
    const alert = toAlert({
      ...BASE,
      decision: "REVIEW",
      escalatedBy: "RISK_ENGINE",
      trajectoryScore: 15,
      trajectoryTier: "LOW",
      trajectoryReason: "BURST_RATE: 2 requests in 60s",
    });

    expect(alert?.escalatedBy).toBe("RISK_ENGINE");
    expect(alert?.escalatedBy).not.toBe("TRAJECTORY");
  });

  it("existing REVIEW or DENY recorded as NONE stays NONE, even with a high trajectory score", () => {
    const review = toAlert({
      ...BASE,
      decision: "REVIEW",
      escalatedBy: "NONE",
      trajectoryScore: 85,
      trajectoryTier: "CRITICAL",
      trajectoryReason: "DENIAL_DENSITY: 5 recent denials",
    });
    const deny = toAlert({
      ...BASE,
      requestId: "req-2",
      decision: "DENY",
      escalatedBy: "NONE",
      trajectoryScore: 90,
      trajectoryTier: "CRITICAL",
      trajectoryReason: "DENIAL_DENSITY: 6 recent denials",
    });

    expect(review?.escalatedBy).toBe("NONE");
    expect(deny?.escalatedBy).toBe("NONE");
  });

  it("legacy row with no V9 fields keeps every trajectory field null (not evaluated, not recorded)", () => {
    const alert = toAlert({ ...BASE, decision: "DENY" });

    expect(alert).not.toBeNull();
    expect(alert?.trajectoryScore).toBeNull();
    expect(alert?.trajectoryTier).toBeNull();
    expect(alert?.trajectoryReason).toBeNull();
    expect(alert?.escalatedBy).toBeNull();
  });

  it("the policy score never becomes a trajectory score or tier", () => {
    const alert = toAlert({ ...BASE, decision: "DENY", riskScore: 95 });

    expect(alert?.policyRiskScore).toBe(95);
    expect(alert?.trajectoryScore).toBeNull();
    expect(alert?.trajectoryTier).toBeNull();
  });

  it("invalid trajectory values are dropped rather than shown", () => {
    const alert = toAlert({
      ...BASE,
      decision: "REVIEW",
      escalatedBy: "MANUAL",
      trajectoryScore: 240,
      trajectoryTier: "SEVERE",
      trajectoryReason: "   ",
    });

    expect(alert?.trajectoryScore).toBeNull();
    expect(alert?.trajectoryTier).toBeNull();
    expect(alert?.trajectoryReason).toBeNull();
    expect(alert?.escalatedBy).toBeNull();
  });
});
