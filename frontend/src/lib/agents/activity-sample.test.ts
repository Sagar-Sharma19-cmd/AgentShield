import { describe, expect, it } from "vitest";
import { GATES } from "@/lib/checkpoint/gates";
import { decisionCounts, gateBreakdown, recentActivity, sampleLabel, type ActivityRow } from "./activity-sample";

const row = (overrides: Partial<ActivityRow>, index = 0): ActivityRow => ({
  requestId: `r-${index}`,
  timestamp: `2026-11-01T10:00:0${index}Z`,
  tool: "filesystem",
  action: "READ",
  resource: "src/app.ts",
  decision: "ALLOW",
  authorizationResult: "AUTHORIZED",
  escalatedBy: "NONE",
  ...overrides,
});

describe("gateBreakdown", () => {
  it("lists every gate in pipeline order with counts and shares from gateFor", () => {
    const rows = [
      row({}),
      row({}),
      row({ authorizationResult: "UNAUTHORIZED", decision: "DENY" }),
      row({ decision: "REVIEW", escalatedBy: "TRAJECTORY" }),
    ];
    const breakdown = gateBreakdown(rows);
    expect(breakdown.map((item) => item.gate)).toEqual([...GATES]);
    expect(Object.fromEntries(breakdown.map((item) => [item.gate, item.count]))).toEqual({
      IDENTITY: 0,
      PERMISSION: 1,
      INSPECTION: 0,
      POLICY: 0,
      RISK_ENGINE: 0,
      TRAJECTORY: 1,
      PASSED: 2,
    });
    expect(breakdown.find((item) => item.gate === "PASSED")?.share).toBe(0.5);
    expect(breakdown.reduce((sum, item) => sum + item.count, 0)).toBe(rows.length);
  });

  it("has zero shares for an empty sample instead of dividing by zero", () => {
    expect(gateBreakdown([]).every((item) => item.count === 0 && item.share === 0)).toBe(true);
  });
});

describe("decisionCounts", () => {
  it("counts each final decision", () => {
    expect(decisionCounts([row({}), row({ decision: "DENY" }), row({ decision: "DENY" })])).toEqual({ ALLOW: 1, REVIEW: 0, DENY: 2 });
  });
});

describe("recentActivity", () => {
  it("keeps the API's newest-first order, limits the list and adds the gate", () => {
    const rows = [0, 1, 2].map((index) => row({ decision: index === 1 ? "DENY" : "ALLOW", authorizationResult: index === 1 ? "TOOL_DISABLED" : "AUTHORIZED" }, index));
    const items = recentActivity(rows, 2);
    expect(items.map((item) => item.requestId)).toEqual(["r-0", "r-1"]);
    expect(items[1].gate).toBe("PERMISSION");
    expect(recentActivity(rows, -1)).toEqual([]);
  });
});

describe("sampleLabel", () => {
  it("says latest 100 when the sample is full, and the real count otherwise", () => {
    expect(sampleLabel(100, 100)).toBe("Latest 100 requests");
    expect(sampleLabel(100, 7)).toBe("Latest 7 requests");
    expect(sampleLabel(100, 1)).toBe("Latest 1 request");
  });
});
