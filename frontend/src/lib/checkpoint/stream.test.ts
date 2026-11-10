import { describe, expect, it } from "vitest";
import type { AuditLogResponse } from "@/types/api";
import { dotsByGate, outcomePhrase, planStream, summarizeArrivals, type StreamRow } from "./stream";

/** Newest first, like the audit API: index 0 is the latest. */
function rows(count: number, overrides: (index: number) => Partial<AuditLogResponse> = () => ({})): StreamRow[] {
  return Array.from({ length: count }, (_, index) => ({
    requestId: `r${index}`,
    timestamp: new Date(Date.UTC(2026, 10, 10, 10, 0, 0) - index * 1000).toISOString(),
    decision: "ALLOW",
    authorizationResult: "AUTHORIZED",
    escalatedBy: "NONE",
    agentId: "agent",
    tool: "github",
    action: "READ",
    resource: "repo",
    ...overrides(index),
  }));
}

const limits = { maxDots: 40, replay: 20, maxConcurrent: 12 };

describe("planStream", () => {
  it("handles an empty sample", () => {
    const plan = planStream([], null, limits);
    expect(plan.dots).toEqual([]);
    expect(plan.arrivals).toEqual([]);
    expect(plan.seen.size).toBe(0);
  });

  it("caps the dots on screen", () => {
    expect(planStream(rows(100), null, limits).dots).toHaveLength(40);
  });

  it("orders dots oldest first", () => {
    const plan = planStream(rows(3), null, limits);
    expect(plan.dots.map((dot) => dot.row.requestId)).toEqual(["r2", "r1", "r0"]);
  });

  it("replays the newest rows on first load, capped by maxConcurrent", () => {
    const plan = planStream(rows(30), null, limits);
    expect(plan.arrivals).toHaveLength(20);
    const travelling = plan.dots.filter((dot) => dot.travels);
    expect(travelling).toHaveLength(12);
    // The newest 12 travel; the oldest of them leaves first.
    expect(travelling.map((dot) => dot.row.requestId)).toEqual(
      Array.from({ length: 12 }, (_, index) => `r${11 - index}`),
    );
    expect(travelling.map((dot) => dot.order)).toEqual(Array.from({ length: 12 }, (_, index) => index));
    expect(plan.dots.filter((dot) => !dot.travels).every((dot) => dot.order === -1)).toBe(true);
  });

  it("only animates rows not seen before", () => {
    const first = planStream(rows(5), null, limits);
    const next = [...rows(2, (index) => ({ requestId: `new${index}` })), ...rows(5)];
    const plan = planStream(next, first.seen, limits);
    expect(plan.arrivals.map((row) => row.requestId)).toEqual(["new0", "new1"]);
    expect(plan.dots.filter((dot) => dot.travels).map((dot) => dot.row.requestId).sort()).toEqual(["new0", "new1"]);
  });

  it("animates nothing when the refetch brought no new rows", () => {
    const first = planStream(rows(5), null, limits);
    const plan = planStream(rows(5), first.seen, limits);
    expect(plan.arrivals).toEqual([]);
    expect(plan.dots.some((dot) => dot.travels)).toBe(false);
  });

  it("assigns each dot its gate column", () => {
    const sample = rows(3, (index) =>
      index === 0
        ? { decision: "DENY", authorizationResult: "AGENT_REVOKED" }
        : index === 1
          ? { decision: "REVIEW", escalatedBy: "TRAJECTORY" }
          : {},
    );
    const byId = Object.fromEntries(planStream(sample, null, limits).dots.map((dot) => [dot.row.requestId, [dot.gate, dot.column]]));
    expect(byId).toEqual({ r0: ["IDENTITY", 0], r1: ["TRAJECTORY", 4], r2: ["PASSED", 5] });
  });

  it("tolerates zero or negative limits", () => {
    const plan = planStream(rows(5), null, { maxDots: 0, replay: -1, maxConcurrent: 0 });
    expect(plan.dots).toEqual([]);
    expect(plan.arrivals).toEqual([]);
  });
});

describe("dotsByGate", () => {
  it("returns every gate, empty when unused", () => {
    const columns = dotsByGate(planStream(rows(2), null, limits).dots);
    expect(Object.keys(columns)).toEqual(["IDENTITY", "PERMISSION", "POLICY", "RISK_ENGINE", "TRAJECTORY", "PASSED"]);
    expect(columns.PASSED).toHaveLength(2);
    expect(columns.POLICY).toEqual([]);
  });
});

describe("outcomePhrase", () => {
  it("describes each outcome", () => {
    expect(outcomePhrase("ALLOW", "PASSED")).toBe("allowed");
    expect(outcomePhrase("DENY", "POLICY")).toBe("denied at Policy");
    expect(outcomePhrase("REVIEW", "TRAJECTORY")).toBe("held for review at Trajectory");
    expect(outcomePhrase("DENY", "IDENTITY")).toBe("denied at Identity");
  });
});

describe("summarizeArrivals", () => {
  it("is empty for no arrivals", () => {
    expect(summarizeArrivals([])).toBe("");
  });

  it("summarises allowed first, then review, then denied in pipeline order", () => {
    const summary = summarizeArrivals([
      { decision: "DENY", authorizationResult: "AUTHORIZED", escalatedBy: "NONE" },
      { decision: "ALLOW", authorizationResult: "AUTHORIZED", escalatedBy: "NONE" },
      { decision: "DENY", authorizationResult: "UNAUTHORIZED", escalatedBy: "NONE" },
      { decision: "ALLOW", authorizationResult: "AUTHORIZED", escalatedBy: null },
      { decision: "REVIEW", authorizationResult: "AUTHORIZED", escalatedBy: "RISK_ENGINE" },
    ]);
    expect(summary).toBe("5 new: 2 allowed, 1 held for review at Risk engine, 1 denied at Permission, 1 denied at Policy");
  });

  it("matches the example wording", () => {
    expect(
      summarizeArrivals([
        { decision: "ALLOW", authorizationResult: "AUTHORIZED", escalatedBy: "NONE" },
        { decision: "ALLOW", authorizationResult: "AUTHORIZED", escalatedBy: "NONE" },
        { decision: "DENY", authorizationResult: "AUTHORIZED", escalatedBy: "NONE" },
      ]),
    ).toBe("3 new: 2 allowed, 1 denied at Policy");
  });
});
