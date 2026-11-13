import { describe, expect, it } from "vitest";
import type { ContentFinding } from "@/types/api";
import { groupRuns, MCP_SESSION_PATTERN, realRunSource, runKindOf, runTitle, stepStatusText } from "@/lib/pipeline/runs";
import { APPROVAL_CLAIMED_LABEL, effectiveScore, isApprovalClaim, isOutputCheck, outputCheckSummary, SESSION_SOURCE_LABELS, sessionSource } from "./source";

const MCP = "mcp-0123456789ab";

describe("sessionSource", () => {
  it("labels each known client by its session prefix", () => {
    expect(sessionSource(MCP)).toBe("mcp");
    expect(sessionSource("mcp-dev-0123456789ab")).toBe("mcp");
    expect(sessionSource("guard-0123456789ab")).toBe("guard");
    expect(sessionSource("jenkins-agentshield-guarded-deploy-42")).toBe("jenkins");
    expect(sessionSource("ci-deploy-staging-0123456789ab")).toBe("simulator");
    expect(SESSION_SOURCE_LABELS.mcp).toBe("MCP proxy");
  });

  it("gives no label to anything else, including look-alikes", () => {
    for (const other of ["demo-trajectory-1", "mcp-", "mcp-0123456789a", "mcp-0123456789AB", "xmcp-0123456789ab", "MCP-0123456789ab", ""]) {
      expect(sessionSource(other), other).toBeNull();
    }
  });
});

describe("MCP proxy sessions as runs", () => {
  it("are real runs with their own title", () => {
    expect(MCP_SESSION_PATTERN.test(MCP)).toBe(true);
    expect(runKindOf(MCP)).toBe("real");
    expect(realRunSource(MCP)).toEqual({ source: "mcp", job: null, build: null });
    const [run] = groupRuns([
      {
        requestId: "r1",
        sessionId: MCP,
        tool: "filesystem",
        action: "READ",
        resource: "notes/plan.md",
        decision: "ALLOW",
        authorizationResult: "AUTHORIZED",
        escalatedBy: "NONE",
        timestamp: "2026-11-12T10:00:00Z",
      },
    ]);
    expect(run.kind).toBe("real");
    expect(run.slug).toBe("mcp");
    expect(runTitle(run)).toBe("MCP proxy session");
  });

  it("word step details for the proxy, not Jenkins or the guard", () => {
    expect(stepStatusText("EXECUTED", "real", "mcp").detail).toMatch(/MCP proxy/);
    expect(stepStatusText("EXECUTED", "real", "mcp").detail).not.toMatch(/Jenkins/);
    expect(stepStatusText("EXECUTED", "real", "mcp").label).toBe("Allowed");
    expect(stepStatusText("EXECUTED", "real", "jenkins").detail).toMatch(/Jenkins/);
    // the source is ignored for simulator runs
    expect(stepStatusText("EXECUTED", "simulator", "mcp").detail).toMatch(/mock tool/);
  });
});

describe("output checks", () => {
  const finding = (type: string): ContentFinding => ({ category: "SECRET", type, location: "content", preview: "AKIA… (20 chars)" });

  it("recognises output-inspection rows by their resource", () => {
    expect(isOutputCheck("output:filesystem")).toBe(true);
    expect(isOutputCheck("config/output:x")).toBe(false);
    expect(isOutputCheck("notes/plan.md")).toBe(false);
  });

  it("summarises the verdict and the distinct finding types", () => {
    expect(outputCheckSummary({ inspectionVerdict: "CLEAN", inspectionFindings: [] })).toBe("Clean");
    expect(outputCheckSummary({ inspectionVerdict: "DENY", inspectionFindings: [finding("AWS_ACCESS_KEY"), finding("AWS_ACCESS_KEY")] })).toBe(
      "Deny · AWS access key",
    );
    expect(outputCheckSummary({ inspectionVerdict: "REVIEW", inspectionFindings: [finding("EMAIL"), finding("CREDIT_CARD")] })).toBe(
      "Review · Email address, Payment card number",
    );
    expect(outputCheckSummary({ inspectionVerdict: null })).toBe("Not inspected");
    expect(outputCheckSummary({})).toBe("Not inspected");
  });
});

describe("effective score (V14)", () => {
  it("shows the score that drove the decision, the same one the review shows", () => {
    // The demo case: policy READ 10, Risk Engine did not answer (fail-safe 65), review shows 65.
    expect(effectiveScore({ riskScore: 10, effectiveRiskScore: 65 })).toBe(65);
    expect(effectiveScore({ riskScore: 90, effectiveRiskScore: 90 })).toBe(90);
  });

  it("falls back to the policy score for rows from an older backend", () => {
    expect(effectiveScore({ riskScore: 10 })).toBe(10);
  });
});

describe("approval claims (V14)", () => {
  it("are recognised by their link to the held request", () => {
    expect(isApprovalClaim({ claimedRequestId: "11111111-1111-1111-1111-111111111111" })).toBe(true);
    expect(isApprovalClaim({ claimedRequestId: null })).toBe(false);
    expect(isApprovalClaim({})).toBe(false);
    expect(APPROVAL_CLAIMED_LABEL).toBe("Approval claimed");
  });

  it("are left out of pipeline runs, which already show the claim through the review", () => {
    const base = {
      sessionId: MCP,
      tool: "filesystem",
      action: "WRITE" as const,
      resource: "notes/contact.txt",
      authorizationResult: "AUTHORIZED" as const,
      escalatedBy: "NONE" as const,
    };
    const runs = groupRuns([
      { ...base, requestId: "claim", decision: "ALLOW", timestamp: "2026-11-12T10:01:00Z", claimedRequestId: "held" },
      { ...base, requestId: "held", decision: "REVIEW", timestamp: "2026-11-12T10:00:00Z" },
    ]);
    expect(runs).toHaveLength(1);
    expect(runs[0].rows.map((r) => r.requestId)).toEqual(["held"]);
  });
});
