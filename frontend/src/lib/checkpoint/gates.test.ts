import { describe, expect, it } from "vitest";
import type { AuditLogResponse, AuthorizationResult, DecisionType, EscalationSource } from "@/types/api";
import {
  funnel,
  FUNNEL_STAGES,
  GATE_LABELS,
  GATES,
  gateFor,
  IDENTITY_RESULTS,
  mostEscalatedSession,
  PERMISSION_RESULTS,
  riskTierForScore,
  sessionTrace,
  type GateInput,
  type SessionRow,
} from "./gates";

function input(
  authorizationResult: AuthorizationResult,
  decision: DecisionType,
  escalatedBy: EscalationSource | null = "NONE",
): GateInput {
  return { authorizationResult, decision, escalatedBy };
}

let counter = 0;
function row(overrides: Partial<AuditLogResponse> = {}): SessionRow {
  counter += 1;
  return {
    requestId: `req-${counter}`,
    sessionId: "s-1",
    agentId: "agent-1",
    timestamp: "2026-11-10T10:00:00Z",
    decision: "ALLOW",
    trajectoryScore: null,
    authorizationResult: "AUTHORIZED",
    escalatedBy: "NONE",
    ...overrides,
  };
}

describe("gateFor", () => {
  it.each(["AGENT_NOT_FOUND", "AGENT_SUSPENDED", "AGENT_REVOKED", "AGENT_IDENTITY_MISMATCH"] as const)(
    "%s is decided at IDENTITY",
    (result) => {
      expect(gateFor(input(result, "DENY"))).toBe("IDENTITY");
      expect(gateFor(input(result, "DENY", null))).toBe("IDENTITY");
    },
  );

  it.each(["TOOL_NOT_FOUND", "TOOL_DISABLED", "UNAUTHORIZED", "PERMISSION_DISABLED"] as const)(
    "%s is decided at PERMISSION",
    (result) => {
      expect(gateFor(input(result, "DENY"))).toBe("PERMISSION");
      expect(gateFor(input(result, "DENY", "RISK_ENGINE"))).toBe("PERMISSION");
    },
  );

  it("classifies every authorization result except AUTHORIZED as identity or permission", () => {
    const all: AuthorizationResult[] = [
      "AUTHORIZED",
      "UNAUTHORIZED",
      "AGENT_NOT_FOUND",
      "AGENT_SUSPENDED",
      "AGENT_REVOKED",
      "AGENT_IDENTITY_MISMATCH",
      "TOOL_NOT_FOUND",
      "TOOL_DISABLED",
      "PERMISSION_DISABLED",
    ];
    for (const result of all) {
      const classified = IDENTITY_RESULTS.has(result) || PERMISSION_RESULTS.has(result);
      expect(classified, result).toBe(result !== "AUTHORIZED");
    }
  });

  it("ALLOW is PASSED whatever escalatedBy says", () => {
    expect(gateFor(input("AUTHORIZED", "ALLOW", "NONE"))).toBe("PASSED");
    expect(gateFor(input("AUTHORIZED", "ALLOW", null))).toBe("PASSED");
    expect(gateFor(input("AUTHORIZED", "ALLOW", "RISK_ENGINE"))).toBe("PASSED");
  });

  it("authorized DENY escalated by the Risk Engine is RISK_ENGINE", () => {
    expect(gateFor(input("AUTHORIZED", "DENY", "RISK_ENGINE"))).toBe("RISK_ENGINE");
  });

  it("authorized DENY without a Risk Engine escalation is POLICY", () => {
    expect(gateFor(input("AUTHORIZED", "DENY", "NONE"))).toBe("POLICY");
    expect(gateFor(input("AUTHORIZED", "DENY", null))).toBe("POLICY");
    // Trajectory never produces DENY; if such a row appeared it is not attributed to trajectory.
    expect(gateFor(input("AUTHORIZED", "DENY", "TRAJECTORY"))).toBe("POLICY");
  });

  it("authorized REVIEW is attributed to the stage that escalated it", () => {
    expect(gateFor(input("AUTHORIZED", "REVIEW", "TRAJECTORY"))).toBe("TRAJECTORY");
    expect(gateFor(input("AUTHORIZED", "REVIEW", "RISK_ENGINE"))).toBe("RISK_ENGINE");
    expect(gateFor(input("AUTHORIZED", "REVIEW", "NONE"))).toBe("POLICY");
  });

  it("falls back to POLICY for pre-V9 rows with null escalatedBy", () => {
    expect(gateFor(input("AUTHORIZED", "REVIEW", null))).toBe("POLICY");
  });

  it("has a label for every gate", () => {
    for (const gate of GATES) expect(GATE_LABELS[gate]).toBeTruthy();
  });
});

describe("funnel", () => {
  it("returns zero counts and shares for an empty sample", () => {
    const stages = funnel([]);
    expect(stages.map((stage) => stage.id)).toEqual([...FUNNEL_STAGES]);
    for (const stage of stages) {
      expect(stage.count).toBe(0);
      expect(stage.share).toBe(0);
    }
  });

  it("counts how many requests got past each gate", () => {
    const rows = [
      input("AGENT_REVOKED", "DENY"), // stopped at identity
      input("UNAUTHORIZED", "DENY"), // stopped at permission
      input("AUTHORIZED", "DENY", "NONE"), // stopped at policy
      input("AUTHORIZED", "REVIEW", null), // stopped at policy (pre-V9)
      input("AUTHORIZED", "DENY", "RISK_ENGINE"), // stopped at risk engine
      input("AUTHORIZED", "REVIEW", "TRAJECTORY"), // stopped at trajectory
      input("AUTHORIZED", "ALLOW"),
      input("AUTHORIZED", "ALLOW"),
    ];
    const counts = Object.fromEntries(funnel(rows).map((stage) => [stage.id, stage.count]));
    expect(counts).toEqual({ REQUESTS: 8, AUTHORIZED: 6, PASSED_POLICY: 4, PASSED_RISK: 3, ALLOWED: 2 });
  });

  it("computes shares against the sample size", () => {
    const stages = funnel([input("AUTHORIZED", "ALLOW"), input("UNAUTHORIZED", "DENY")]);
    expect(stages.find((stage) => stage.id === "REQUESTS")?.share).toBe(1);
    expect(stages.find((stage) => stage.id === "ALLOWED")?.share).toBe(0.5);
  });

  it("never increases from one stage to the next", () => {
    const rows = [
      input("AUTHORIZED", "ALLOW"),
      input("AUTHORIZED", "REVIEW", "RISK_ENGINE"),
      input("TOOL_DISABLED", "DENY"),
      input("AUTHORIZED", "REVIEW", "TRAJECTORY"),
    ];
    const counts = funnel(rows).map((stage) => stage.count);
    for (let index = 1; index < counts.length; index += 1) {
      expect(counts[index]).toBeLessThanOrEqual(counts[index - 1]);
    }
  });
});

describe("sessionTrace", () => {
  it("returns an empty list for an empty sample or unknown session", () => {
    expect(sessionTrace([], "s-1")).toEqual([]);
    expect(sessionTrace([row({ sessionId: "other" })], "s-1")).toEqual([]);
  });

  it("keeps only the session's rows, oldest first", () => {
    const rows = [
      row({ requestId: "c", timestamp: "2026-11-10T10:00:03Z", decision: "REVIEW", trajectoryScore: 65, escalatedBy: "TRAJECTORY" }),
      row({ requestId: "x", sessionId: "other", timestamp: "2026-11-10T10:00:02Z" }),
      row({ requestId: "b", timestamp: "2026-11-10T10:00:02Z", decision: "DENY", trajectoryScore: null }),
      row({ requestId: "a", timestamp: "2026-11-10T10:00:01Z", trajectoryScore: 0 }),
    ];
    const trace = sessionTrace(rows, "s-1");
    expect(trace.map((point) => point.requestId)).toEqual(["a", "b", "c"]);
    expect(trace[2]).toEqual({
      requestId: "c",
      timestamp: "2026-11-10T10:00:03Z",
      decision: "REVIEW",
      trajectoryScore: 65,
      gate: "TRAJECTORY",
    });
    expect(trace[1].trajectoryScore).toBeNull();
    expect(trace[1].gate).toBe("POLICY");
  });

  it("orders equal timestamps as oldest-first given a newest-first input", () => {
    const rows = [
      row({ requestId: "second", timestamp: "2026-11-10T10:00:00Z" }),
      row({ requestId: "first", timestamp: "2026-11-10T10:00:00Z" }),
    ];
    expect(sessionTrace(rows, "s-1").map((point) => point.requestId)).toEqual(["first", "second"]);
  });
});

describe("mostEscalatedSession", () => {
  it("returns null for an empty sample", () => {
    expect(mostEscalatedSession([])).toBeNull();
  });

  it("returns null when no row has a trajectory score", () => {
    expect(mostEscalatedSession([row(), row({ sessionId: "s-2" })])).toBeNull();
  });

  it("picks the session with the highest trajectory score", () => {
    const rows = [
      row({ sessionId: "low", trajectoryScore: 20 }),
      row({ sessionId: "high", agentId: "agent-9", trajectoryScore: 75, timestamp: "2026-11-10T10:05:00Z" }),
      row({ sessionId: "high", trajectoryScore: 40 }),
      row({ sessionId: "mid", trajectoryScore: 55 }),
    ];
    expect(mostEscalatedSession(rows)).toEqual({
      sessionId: "high",
      agentId: "agent-9",
      peakScore: 75,
      peakAt: "2026-11-10T10:05:00Z",
    });
  });

  it("counts a score of 0 as a recorded score", () => {
    expect(mostEscalatedSession([row({ sessionId: "zero", trajectoryScore: 0 })])?.sessionId).toBe("zero");
  });

  it("breaks ties by the more recent peak", () => {
    const rows = [
      row({ sessionId: "older", trajectoryScore: 60, timestamp: "2026-11-10T09:00:00Z" }),
      row({ sessionId: "newer", trajectoryScore: 60, timestamp: "2026-11-10T11:00:00Z" }),
    ];
    expect(mostEscalatedSession(rows)?.sessionId).toBe("newer");
  });
});

describe("riskTierForScore", () => {
  it("uses the documented band edges", () => {
    expect(riskTierForScore(0)).toBe("LOW");
    expect(riskTierForScore(29)).toBe("LOW");
    expect(riskTierForScore(30)).toBe("MEDIUM");
    expect(riskTierForScore(59)).toBe("MEDIUM");
    expect(riskTierForScore(60)).toBe("HIGH");
    expect(riskTierForScore(79)).toBe("HIGH");
    expect(riskTierForScore(80)).toBe("CRITICAL");
    expect(riskTierForScore(100)).toBe("CRITICAL");
  });

  it("clamps out-of-range scores", () => {
    expect(riskTierForScore(-5)).toBe("LOW");
    expect(riskTierForScore(150)).toBe("CRITICAL");
  });
});
