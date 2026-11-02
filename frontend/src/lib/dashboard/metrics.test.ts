import { describe, expect, it } from "vitest";
import { bucketRiskScores, countAgents, toDecisionShares, toPercent } from "./metrics";

describe("countAgents", () => {
  it("returns zeros for an empty registry", () => {
    expect(countAgents([])).toEqual({ registered: 0, active: 0, suspended: 0, revoked: 0 });
  });

  it("counts each lifecycle status and the registered total", () => {
    const agents = [{ status: "ACTIVE" }, { status: "ACTIVE" }, { status: "SUSPENDED" }, { status: "REVOKED" }] as const;
    expect(countAgents([...agents])).toEqual({ registered: 4, active: 2, suspended: 1, revoked: 1 });
  });
});

describe("toDecisionShares", () => {
  it("returns zero shares when there are no evaluations (no division by zero)", () => {
    const shares = toDecisionShares(0, { ALLOW: 0, REVIEW: 0, DENY: 0 });
    expect(shares.map((s) => s.share)).toEqual([0, 0, 0]);
  });

  it("computes each decision's share of the total in ALLOW, REVIEW, DENY order", () => {
    const shares = toDecisionShares(4, { ALLOW: 2, REVIEW: 1, DENY: 1 });
    expect(shares).toEqual([
      { decision: "ALLOW", count: 2, share: 0.5 },
      { decision: "REVIEW", count: 1, share: 0.25 },
      { decision: "DENY", count: 1, share: 0.25 },
    ]);
  });
});

describe("toPercent", () => {
  it("rounds a 0–1 share to a whole percentage", () => {
    expect(toPercent(0)).toBe(0);
    expect(toPercent(1 / 3)).toBe(33);
    expect(toPercent(0.666)).toBe(67);
  });
});

describe("bucketRiskScores", () => {
  it("returns five empty bands when there are no scores", () => {
    expect(bucketRiskScores([]).map((b) => b.count)).toEqual([0, 0, 0, 0, 0]);
  });

  it("places scores into 20-point bands with the top band including 100", () => {
    const buckets = bucketRiskScores([0, 19, 20, 59, 60, 79, 80, 100]);
    expect(buckets.map((b) => [b.label, b.count])).toEqual([
      ["0–19", 2],
      ["20–39", 1],
      ["40–59", 1],
      ["60–79", 2],
      ["80–100", 2],
    ]);
  });

  it("maps the PolicyEngine's fixed scores to the expected bands and tones", () => {
    // ALLOW 10/20, REVIEW 60, DENY 90/95 per docs/architecture.md.
    const buckets = bucketRiskScores([10, 20, 60, 90, 95]);
    expect(buckets.map((b) => [b.count, b.tone])).toEqual([
      [1, "low"],
      [1, "low"],
      [0, "medium"],
      [1, "medium"],
      [2, "high"],
    ]);
  });

  it("clamps out-of-range scores instead of dropping them", () => {
    const buckets = bucketRiskScores([-5, 140]);
    expect(buckets[0].count).toBe(1);
    expect(buckets[4].count).toBe(1);
  });
});
