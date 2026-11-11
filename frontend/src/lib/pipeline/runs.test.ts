import { describe, expect, it } from "vitest";
import { PIPELINE_SCENARIOS, simulatorRunCommand, type PipelineScenario } from "./catalog";
import {
  describeStep,
  diffSteps,
  groupRuns,
  isLiveStatus,
  IDLE_REFRESH_MS,
  LIVE_REFRESH_MS,
  pollIntervalFor,
  pipelineSlug,
  reviewsByRequest,
  runStatus,
  runSteps,
  runTitle,
  STEP_STATUSES,
  STEP_STATUS_META,
  type RunReview,
  type RunRow,
  type RunStep,
} from "./runs";

const scenario = (id: string): PipelineScenario => PIPELINE_SCENARIOS.find((item) => item.id === id)!;
const DEPLOY = scenario("deployment_pipeline");
const NOW = Date.parse("2026-11-11T10:00:00Z");
const NO_REVIEWS = new Map<string, RunReview>();

let counter = 0;
function row(sessionId: string, timestamp: string, step: { tool: string; action: RunRow["action"]; resource: string }, overrides: Partial<RunRow> = {}): RunRow {
  counter += 1;
  return {
    requestId: `req-${counter}`,
    sessionId,
    tool: step.tool,
    action: step.action,
    resource: step.resource,
    decision: "ALLOW",
    authorizationResult: "AUTHORIZED",
    escalatedBy: "NONE",
    timestamp,
    ...overrides,
  };
}

function review(requestId: string, overrides: Partial<RunReview> = {}): RunReview {
  return {
    id: `rev-${requestId}`,
    requestId,
    status: "PENDING",
    expired: false,
    expiresAt: "2026-11-11T11:00:00Z",
    consumedAt: null,
    reviewer: null,
    note: null,
    reviewedAt: null,
    ...overrides,
  };
}

const SESSION = "ci-deploy-staging-3f9c2a1b8d4e";
const at = (seconds: number) => new Date(NOW - 60_000 + seconds * 1000).toISOString();

describe("pipelineSlug", () => {
  it("follows enforcement.new_session_id", () => {
    expect(pipelineSlug("deploy-staging")).toBe("deploy-staging");
    expect(pipelineSlug("Deploy Staging!")).toBe("deploy-staging");
    expect(pipelineSlug("--x--")).toBe("x");
    expect(pipelineSlug("***")).toBe("pipeline");
    expect(pipelineSlug("a".repeat(40))).toHaveLength(32);
  });

  it("gives every catalog scenario a distinct slug", () => {
    const slugs = PIPELINE_SCENARIOS.map((item) => pipelineSlug(item.pipelineName));
    expect(new Set(slugs).size).toBe(PIPELINE_SCENARIOS.length);
    expect(slugs).toEqual(["build-staging", "leak-attempt", "trigger-build", "deploy-staging", "cleanup-canary"]);
  });
});

describe("groupRuns", () => {
  it("groups by session, orders rows oldest first and runs newest first", () => {
    const older = "ci-build-staging-aaaaaaaaaaaa";
    const rows = [
      row(SESSION, at(20), DEPLOY.steps[1]),
      row(older, at(5), scenario("basic_read_write").steps[0]),
      row(SESSION, at(10), DEPLOY.steps[0]),
    ];
    const runs = groupRuns(rows);
    expect(runs.map((run) => run.sessionId)).toEqual([SESSION, older]);
    expect(runs[0].rows.map((r) => r.timestamp)).toEqual([at(10), at(20)]);
    expect(runs[0].startedAt).toBe(at(10));
    expect(runs[0].lastActivityAt).toBe(at(20));
    expect(runs[0].scenario?.id).toBe("deployment_pipeline");
    expect(runs[1].scenario?.id).toBe("basic_read_write");
  });

  it("orders runs by their first row, not their latest", () => {
    const a = "ci-trigger-build-000000000001";
    const b = "ci-trigger-build-000000000002";
    const step = scenario("review_required").steps[0];
    const runs = groupRuns([row(a, at(50), step), row(b, at(30), step), row(a, at(10), step)]);
    expect(runs.map((run) => run.sessionId)).toEqual([b, a]);
  });

  it("drops rows that are not simulator runs", () => {
    const step = DEPLOY.steps[0];
    const rows = [
      row("demo-trajectory-1", at(1), step),
      row("ci-deploy-staging-XYZ", at(2), step),
      row("ci-deploy-staging-3f9c2a1b8d4", at(3), step),
      row("ci-Deploy-staging-3f9c2a1b8d4e", at(4), step),
      row("ci--3f9c2a1b8d4e", at(5), step),
    ];
    expect(groupRuns(rows)).toEqual([]);
  });

  it("keeps an unknown slug as an Unknown pipeline", () => {
    const runs = groupRuns([row("ci-nightly-release-0123456789ab", at(1), { tool: "shell", action: "EXECUTE", resource: "x" })]);
    expect(runs).toHaveLength(1);
    expect(runs[0].slug).toBe("nightly-release");
    expect(runs[0].scenario).toBeNull();
    expect(runTitle(runs[0])).toBe("Unknown pipeline");
  });

  it("breaks timestamp ties by API order (newest first)", () => {
    const first = row(SESSION, at(10), DEPLOY.steps[0]);
    const second = row(SESSION, at(10), DEPLOY.steps[1]);
    expect(groupRuns([second, first])[0].rows).toEqual([first, second]);
  });

  it("flags the run holding the oldest row of a full sample as possibly truncated", () => {
    const old = "ci-build-staging-aaaaaaaaaaaa";
    const rows = [row(SESSION, at(30), DEPLOY.steps[0]), row(old, at(1), scenario("basic_read_write").steps[1])];
    const full = groupRuns(rows, PIPELINE_SCENARIOS, { sampleLimit: 2 });
    expect(full.find((run) => run.sessionId === old)?.possiblyTruncated).toBe(true);
    expect(full.find((run) => run.sessionId === SESSION)?.possiblyTruncated).toBe(false);
    expect(groupRuns(rows, PIPELINE_SCENARIOS, { sampleLimit: 100 }).every((run) => !run.possiblyTruncated)).toBe(true);
  });
});

describe("runSteps", () => {
  const [read, build, push, apply] = DEPLOY.steps;

  it("returns one entry per catalog step, in order", () => {
    const steps = runSteps({ rows: [] }, DEPLOY, NO_REVIEWS, NOW);
    expect(steps.map((step) => [step.index, step.tool, step.action, step.status])).toEqual([
      [1, "github", "READ", "NOT_STARTED"],
      [2, "docker", "WRITE", "NOT_STARTED"],
      [3, "docker", "EXTERNAL_REQUEST", "NOT_STARTED"],
      [4, "kubernetes", "WRITE", "NOT_STARTED"],
    ]);
    expect(steps[0].summary).toBe(read.summary);
  });

  it("ALLOW is EXECUTED; later steps are NOT_STARTED while the run goes on", () => {
    const steps = runSteps({ rows: [row(SESSION, at(1), read)] }, DEPLOY, NO_REVIEWS, NOW);
    expect(steps.map((step) => step.status)).toEqual(["EXECUTED", "NOT_STARTED", "NOT_STARTED", "NOT_STARTED"]);
  });

  it("DENY is BLOCKED with its gate, and the rest are SKIPPED", () => {
    const denied = row(SESSION, at(2), build, { decision: "DENY", authorizationResult: "UNAUTHORIZED" });
    const steps = runSteps({ rows: [row(SESSION, at(1), read), denied] }, DEPLOY, NO_REVIEWS, NOW);
    expect(steps.map((step) => step.status)).toEqual(["EXECUTED", "BLOCKED", "SKIPPED", "SKIPPED"]);
    expect(steps[1].gate).toBe("PERMISSION");
    expect(steps[0].gate).toBeNull();
  });

  it("uses the Policy and Risk engine gates for authorized denials", () => {
    const policy = row(SESSION, at(1), read, { decision: "DENY" });
    expect(runSteps({ rows: [policy] }, DEPLOY, NO_REVIEWS, NOW)[0].gate).toBe("POLICY");
    const risk = row(SESSION, at(1), read, { decision: "DENY", escalatedBy: "RISK_ENGINE" });
    expect(runSteps({ rows: [risk] }, DEPLOY, NO_REVIEWS, NOW)[0].gate).toBe("RISK_ENGINE");
  });

  describe("REVIEW", () => {
    const rows = [row(SESSION, at(1), read), row(SESSION, at(2), build), row(SESSION, at(3), push, { decision: "REVIEW" })];
    const reviewRow = rows[2];
    const statusWith = (overrides: Partial<RunReview>, now = NOW) =>
      runSteps({ rows }, DEPLOY, reviewsByRequest([review(reviewRow.requestId, overrides)]), now).map((step) => step.status);

    it("PENDING or IN_REVIEW and not expired is WAITING; the next step is NOT_STARTED", () => {
      expect(statusWith({ status: "PENDING" })).toEqual(["EXECUTED", "EXECUTED", "WAITING", "NOT_STARTED"]);
      expect(statusWith({ status: "IN_REVIEW" })[2]).toBe("WAITING");
    });

    it("an open review past expiresAt, or flagged expired, is EXPIRED and halts", () => {
      expect(statusWith({ status: "PENDING", expired: true })).toEqual(["EXECUTED", "EXECUTED", "EXPIRED", "SKIPPED"]);
      expect(statusWith({ status: "IN_REVIEW" }, Date.parse("2026-11-11T11:00:00Z"))[2]).toBe("EXPIRED");
    });

    it("APPROVED with consumedAt is APPROVED_EXECUTED, even after expiry", () => {
      const approved = { status: "APPROVED" as const, consumedAt: at(10), reviewer: "Sagar" };
      expect(statusWith(approved)[2]).toBe("APPROVED_EXECUTED");
      expect(statusWith({ ...approved, expired: true })[2]).toBe("APPROVED_EXECUTED");
    });

    it("APPROVED without consumedAt is APPROVED_UNCLAIMED, or EXPIRED once expired", () => {
      expect(statusWith({ status: "APPROVED" })).toEqual(["EXECUTED", "EXECUTED", "APPROVED_UNCLAIMED", "NOT_STARTED"]);
      expect(statusWith({ status: "APPROVED", expired: true })[2]).toBe("EXPIRED");
    });

    it("REJECTED is REJECTED and halts", () => {
      const steps = runSteps(
        { rows },
        DEPLOY,
        reviewsByRequest([review(reviewRow.requestId, { status: "REJECTED", reviewer: "Sagar", note: "Not today" })]),
        NOW,
      );
      expect(steps.map((step) => step.status)).toEqual(["EXECUTED", "EXECUTED", "REJECTED", "SKIPPED"]);
      expect(steps[2].review?.note).toBe("Not today");
    });

    it("a review missing from the lists is REVIEW_UNKNOWN, not a guess", () => {
      expect(runSteps({ rows }, DEPLOY, NO_REVIEWS, NOW)[2].status).toBe("REVIEW_UNKNOWN");
    });

    it("ignores reviews of other requests", () => {
      const other = reviewsByRequest([review("someone-else", { status: "REJECTED" })]);
      expect(runSteps({ rows }, DEPLOY, other, NOW)[2].status).toBe("REVIEW_UNKNOWN");
    });
  });

  it("all four allowed is all EXECUTED", () => {
    const rows = [read, build, push, apply].map((step, i) => row(SESSION, at(i), step));
    expect(runSteps({ rows }, DEPLOY, NO_REVIEWS, NOW).every((step) => step.status === "EXECUTED")).toBe(true);
  });

  it("a missing step with a later row (--continue-on-block) is SKIPPED", () => {
    const rows = [row(SESSION, at(1), read), row(SESSION, at(3), push)];
    expect(runSteps({ rows }, DEPLOY, NO_REVIEWS, NOW).map((step) => step.status)).toEqual([
      "EXECUTED",
      "SKIPPED",
      "EXECUTED",
      "NOT_STARTED",
    ]);
  });

  it("shows rows after a block when the simulator continued", () => {
    const rows = [row(SESSION, at(1), read, { decision: "DENY" }), row(SESSION, at(2), build), row(SESSION, at(3), push)];
    expect(runSteps({ rows }, DEPLOY, NO_REVIEWS, NOW).map((step) => step.status)).toEqual([
      "BLOCKED",
      "EXECUTED",
      "EXECUTED",
      "SKIPPED",
    ]);
  });

  it("matches rows on tool, action and resource, not position", () => {
    const stray = row(SESSION, at(1), { tool: "docker", action: "WRITE", resource: "other" });
    const steps = runSteps({ rows: [stray, row(SESSION, at(2), read)] }, DEPLOY, NO_REVIEWS, NOW);
    expect(steps[0].status).toBe("EXECUTED");
    expect(steps[1].row).toBeNull();
  });

  it("lists rows as steps for an unknown pipeline", () => {
    const rows = [row("ci-x-0123456789ab", at(1), { tool: "shell", action: "EXECUTE", resource: "a" }, { decision: "DENY" })];
    const steps = runSteps({ rows }, null, NO_REVIEWS, NOW);
    expect(steps).toHaveLength(1);
    expect(steps[0]).toMatchObject({ index: 1, tool: "shell", summary: null, status: "BLOCKED", gate: "POLICY" });
  });
});

describe("runStatus", () => {
  const of = (...statuses: RunStep["status"][]) => runStatus(statuses.map((status) => ({ status })));

  it("is decided by the first step that did not run", () => {
    expect(of("EXECUTED", "APPROVED_EXECUTED")).toBe("SUCCEEDED");
    expect(of("EXECUTED", "WAITING", "NOT_STARTED")).toBe("WAITING");
    expect(of("EXECUTED", "REVIEW_UNKNOWN")).toBe("WAITING");
    expect(of("EXECUTED", "BLOCKED", "SKIPPED")).toBe("BLOCKED");
    expect(of("REJECTED", "SKIPPED")).toBe("REJECTED");
    expect(of("EXPIRED", "SKIPPED")).toBe("EXPIRED");
    expect(of("EXECUTED", "NOT_STARTED")).toBe("RUNNING");
    expect(of("APPROVED_UNCLAIMED", "NOT_STARTED")).toBe("RUNNING");
    expect(of("SKIPPED", "EXECUTED")).toBe("BLOCKED");
    expect(of("BLOCKED", "EXECUTED")).toBe("BLOCKED");
    expect(of()).toBe("RUNNING");
  });

  it("only Running and Waiting are live", () => {
    expect(isLiveStatus("RUNNING")).toBe(true);
    expect(isLiveStatus("WAITING")).toBe(true);
    for (const status of ["SUCCEEDED", "BLOCKED", "REJECTED", "EXPIRED"] as const) expect(isLiveStatus(status)).toBe(false);
  });
});

describe("pollIntervalFor", () => {
  it("polls fast while waiting for review or recently running, slowly otherwise", () => {
    expect(pollIntervalFor("WAITING", at(-3600), NOW)).toBe(LIVE_REFRESH_MS);
    expect(pollIntervalFor("RUNNING", at(0), NOW)).toBe(LIVE_REFRESH_MS);
    expect(pollIntervalFor("RUNNING", new Date(NOW - 11 * 60_000).toISOString(), NOW)).toBe(IDLE_REFRESH_MS);
    expect(pollIntervalFor("SUCCEEDED", at(0), NOW)).toBe(IDLE_REFRESH_MS);
    expect(pollIntervalFor("BLOCKED", at(0), NOW)).toBe(IDLE_REFRESH_MS);
    expect(pollIntervalFor(undefined, undefined, NOW)).toBe(IDLE_REFRESH_MS);
  });
});

describe("diffSteps and describeStep", () => {
  it("reports only steps whose status changed", () => {
    const before = [
      { index: 1, status: "EXECUTED" as const },
      { index: 2, status: "WAITING" as const },
      { index: 3, status: "NOT_STARTED" as const },
    ];
    const after = [
      { index: 1, status: "EXECUTED" as const },
      { index: 2, status: "APPROVED_EXECUTED" as const },
      { index: 3, status: "EXECUTED" as const },
    ];
    expect(diffSteps(before, after)).toEqual([
      { index: 2, from: "WAITING", to: "APPROVED_EXECUTED" },
      { index: 3, from: "NOT_STARTED", to: "EXECUTED" },
    ]);
    expect(diffSteps(after, after)).toEqual([]);
  });

  it("treats a step missing before as NOT_STARTED", () => {
    expect(diffSteps([], [{ index: 1, status: "NOT_STARTED" }])).toEqual([]);
    expect(diffSteps([], [{ index: 1, status: "BLOCKED" }])).toEqual([{ index: 1, from: "NOT_STARTED", to: "BLOCKED" }]);
  });

  it("writes the live-region sentence", () => {
    const decided = review("r", { reviewer: "Sagar" });
    expect(describeStep({ index: 3, status: "APPROVED_EXECUTED", review: decided, gate: null })).toBe("Step 3 approved by Sagar, executed.");
    expect(describeStep({ index: 3, status: "REJECTED", review: decided, gate: null })).toBe("Step 3 rejected by Sagar.");
    expect(describeStep({ index: 2, status: "REJECTED", review: review("r", { reviewer: "  " }), gate: null })).toBe(
      "Step 2 rejected by an operator.",
    );
    expect(describeStep({ index: 1, status: "BLOCKED", review: null, gate: "PERMISSION" })).toBe("Step 1 blocked at the Permission gate.");
    expect(describeStep({ index: 1, status: "EXECUTED", review: null, gate: null })).toBe("Step 1 allowed, executed.");
    expect(describeStep({ index: 4, status: "NOT_STARTED", review: null, gate: null })).toBeNull();
  });

  it("has a sentence and metadata for every status but NOT_STARTED", () => {
    for (const status of STEP_STATUSES) {
      expect(STEP_STATUS_META[status].label).not.toBe("");
      const text = describeStep({ index: 1, status, review: null, gate: "POLICY" });
      if (status === "NOT_STARTED") expect(text).toBeNull();
      else expect(text).toMatch(/^Step 1 /);
    }
  });
});

describe("simulatorRunCommand", () => {
  it("is the exact simulator command", () => {
    expect(simulatorRunCommand(scenario("review_required"))).toBe("python3 simulator.py --scenario review_required --wait-for-review");
  });
});
