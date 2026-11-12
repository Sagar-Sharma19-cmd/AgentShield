import { describe, expect, it } from "vitest";
import {
  ESCALATION_COPY,
  escalationAttribution,
  formatTrajectoryScore,
  isTrajectoryEscalation,
  parseEscalationSource,
  parseRiskTier,
  parseTrajectoryReason,
  parseTrajectoryScore,
  TRAJECTORY_TIER_LABELS,
  trajectoryEvidence,
} from "./model";

describe("trajectoryEvidence", () => {
  it("ALLOW with trajectory evaluated but no escalation keeps the evaluated score and reports no escalation", () => {
    const raw = { trajectoryScore: 20, trajectoryTier: "LOW", trajectoryReason: "BURST_RATE: 3 requests in 60s" };
    const evidence = trajectoryEvidence(raw);

    expect(evidence).toEqual({
      kind: "evaluated",
      score: 20,
      tier: "LOW",
      reason: "BURST_RATE: 3 requests in 60s",
    });
    expect(escalationAttribution("NONE")).toBe("none");
    expect(isTrajectoryEscalation("NONE")).toBe(false);
  });

  it("evaluated score of 0 is a real score, not missing", () => {
    expect(trajectoryEvidence({ trajectoryScore: 0, trajectoryTier: "LOW", trajectoryReason: "no signal" })).toEqual({
      kind: "evaluated",
      score: 0,
      tier: "LOW",
      reason: "no signal",
    });
  });

  it("NULL trajectory fields (legacy or not evaluated) are not-evaluated, never a zero score", () => {
    expect(trajectoryEvidence({ trajectoryScore: null, trajectoryTier: null, trajectoryReason: null })).toEqual({
      kind: "not-evaluated",
    });
    expect(trajectoryEvidence({})).toEqual({ kind: "not-evaluated" });
  });

  it("a tier or reason without a valid score is still not-evaluated", () => {
    expect(trajectoryEvidence({ trajectoryScore: null, trajectoryTier: "HIGH", trajectoryReason: "x" })).toEqual({
      kind: "not-evaluated",
    });
  });

  it("an evaluated score with no tier or reason keeps them null instead of inventing values", () => {
    expect(trajectoryEvidence({ trajectoryScore: 45, trajectoryTier: null, trajectoryReason: null })).toEqual({
      kind: "evaluated",
      score: 45,
      tier: null,
      reason: null,
    });
  });
});

describe("escalation attribution", () => {
  it("ALLOW escalated to REVIEW by trajectory is attributed to trajectory", () => {
    expect(escalationAttribution("TRAJECTORY")).toBe("trajectory");
    expect(isTrajectoryEscalation("TRAJECTORY")).toBe(true);
    expect(ESCALATION_COPY.trajectory).toBe("Escalated to review by trajectory analysis.");
  });

  it("REVIEW caused by the Risk Engine is attributed to the Risk Engine, not trajectory", () => {
    expect(escalationAttribution("RISK_ENGINE")).toBe("risk-engine");
    expect(isTrajectoryEscalation("RISK_ENGINE")).toBe(false);
    expect(ESCALATION_COPY["risk-engine"]).toBe("Raised by the Risk Engine.");
  });

  it("an existing REVIEW or DENY recorded as NONE is never attributed to trajectory, even with a high score", () => {
    const highTrajectory = { trajectoryScore: 85, trajectoryTier: "CRITICAL", trajectoryReason: "DENIAL_DENSITY" };
    expect(trajectoryEvidence(highTrajectory).kind).toBe("evaluated");
    expect(escalationAttribution("NONE")).toBe("none");
    expect(isTrajectoryEscalation("NONE")).toBe(false);
  });

  it("a decision by content inspection is attributed to inspection, never trajectory", () => {
    expect(escalationAttribution("INSPECTION")).toBe("inspection");
    expect(isTrajectoryEscalation("INSPECTION")).toBe(false);
    expect(ESCALATION_COPY.inspection).toBe("Decided by content inspection of the arguments.");
  });

  it("legacy NULL escalatedBy is 'not recorded', not 'none'", () => {
    expect(escalationAttribution(null)).toBe("not-recorded");
    expect(escalationAttribution(undefined)).toBe("not-recorded");
    expect(ESCALATION_COPY["not-recorded"]).toBe("Not recorded (logged before escalation tracking)");
  });

  it("unknown or lowercase escalatedBy values are not recorded and never trajectory", () => {
    expect(escalationAttribution("trajectory")).toBe("not-recorded");
    expect(escalationAttribution("SOMEONE")).toBe("not-recorded");
    expect(isTrajectoryEscalation("trajectory")).toBe(false);
  });
});

describe("invalid or unavailable values are rejected, not guessed", () => {
  it("accepts integer scores in 0-100 only", () => {
    expect(parseTrajectoryScore(0)).toBe(0);
    expect(parseTrajectoryScore(100)).toBe(100);
    expect(parseTrajectoryScore(-1)).toBeNull();
    expect(parseTrajectoryScore(101)).toBeNull();
    expect(parseTrajectoryScore(42.5)).toBeNull();
    expect(parseTrajectoryScore("60")).toBeNull();
    expect(parseTrajectoryScore(Number.NaN)).toBeNull();
    expect(parseTrajectoryScore(null)).toBeNull();
  });

  it("rejects unknown tiers instead of mapping them", () => {
    expect(parseRiskTier("HIGH")).toBe("HIGH");
    expect(parseRiskTier("SEVERE")).toBeNull();
    expect(parseRiskTier("high")).toBeNull();
    expect(parseRiskTier(undefined)).toBeNull();
  });

  it("rejects unknown escalation sources", () => {
    expect(parseEscalationSource("RISK_ENGINE")).toBe("RISK_ENGINE");
    expect(parseEscalationSource("MANUAL")).toBeNull();
  });

  it("blank or non-string reasons are null so no empty line renders", () => {
    expect(parseTrajectoryReason("   ")).toBeNull();
    expect(parseTrajectoryReason("")).toBeNull();
    expect(parseTrajectoryReason(42)).toBeNull();
    expect(parseTrajectoryReason("  TOOL_FAN_OUT: 4 distinct tools  ")).toBe("TOOL_FAN_OUT: 4 distinct tools");
  });

  it("an out-of-range score makes trajectory not-evaluated even when a tier is present", () => {
    expect(trajectoryEvidence({ trajectoryScore: 150, trajectoryTier: "CRITICAL", trajectoryReason: "x" })).toEqual({
      kind: "not-evaluated",
    });
  });
});

describe("rendering helpers", () => {
  it("formats the score as 'N / 100' so it is clearly a 0-100 trajectory score", () => {
    expect(formatTrajectoryScore(60)).toBe("60 / 100");
    expect(formatTrajectoryScore(0)).toBe("0 / 100");
    expect(formatTrajectoryScore(null)).toBeNull();
  });

  it("labels every tier in words", () => {
    expect(TRAJECTORY_TIER_LABELS).toEqual({ LOW: "Low", MEDIUM: "Medium", HIGH: "High", CRITICAL: "Critical" });
  });
});
