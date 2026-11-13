/**
 * Pipeline runs, rebuilt from recorded audit rows and review requests.
 *
 * The simulator gives every run its own session id, "ci-<pipeline slug>-<12 hex>" (simulator/enforcement.py,
 * new_session_id), and sends one gateway request per step, in order. A run is therefore the set of audit rows
 * that share such a session id. Each step's status is read from its row and, for a REVIEW, from its review
 * request. Nothing is inferred beyond that: a step with no row is "Not started" or "Skipped", never a guess.
 *
 * Real pipeline runs (E2) come from agentshield-guard: its default session id is Jenkins' BUILD_TAG
 * ("jenkins-<job>-<build>"), or "guard-<12 hex>" outside CI. They have no catalog, so their steps are the recorded
 * requests in order. AgentShield records decisions, not command results: for a real run, "allowed" means the
 * guard may run the command after redeeming the decision, and the command's own outcome is in Jenkins.
 *
 * MCP proxy sessions (M1) are real runs too: agentshield-mcp-proxy gives each proxy process one session id,
 * "mcp-<12 hex>" (or "mcp-<name>-<12 hex>" with a longer configured prefix), and its steps are the tool calls the
 * agent made, plus the proxy's output checks ("output:<tool>" rows).
 *
 * Pure: no React, no fetching. Tested in runs.test.ts.
 */
import { gateFor, GATE_LABELS, type Gate } from "@/lib/checkpoint/gates";
import { isEffectivelyExpired } from "@/lib/reviews/expiry";
import type { AuditLogResponse, ReviewRequestResponse } from "@/types/api";
import { PIPELINE_SCENARIOS, type PipelineScenario } from "./catalog";

export const RUN_SESSION_PATTERN = /^ci-([a-z0-9-]+)-([0-9a-f]{12})$/;
/** Jenkins BUILD_TAG, as agentshield-guard uses it by default: "jenkins-<job>-<build number>". */
export const JENKINS_SESSION_PATTERN = /^jenkins-(.+)-(\d+)$/;
/** agentshield-guard's own session id when no CI variable is set. */
export const GUARD_SESSION_PATTERN = /^guard-[0-9a-f]{12}$/;
/** agentshield-mcp-proxy's session id: "mcp-" (optionally "mcp-<name>-") and 12 hex digits, one per proxy process. */
export const MCP_SESSION_PATTERN = /^mcp-(?:[a-z0-9]+-)*[0-9a-f]{12}$/;

/** "simulator": a mock simulator run. "real": a guarded run of real commands (Jenkins, a bare guard or the MCP proxy). */
export type RunKind = "simulator" | "real";

export interface RealRunSource {
  source: "jenkins" | "guard" | "mcp";
  /** Jenkins job name (as in BUILD_TAG, folders joined by "-"); null for a guard or MCP proxy session. */
  job: string | null;
  /** Jenkins build number; null for a guard or MCP proxy session. */
  build: number | null;
}

/** Which kind of run a session id belongs to, or null when it is not a pipeline run. */
export function runKindOf(sessionId: string): RunKind | null {
  if (RUN_SESSION_PATTERN.test(sessionId)) return "simulator";
  return realRunSource(sessionId) ? "real" : null;
}

/** Where a real run came from, parsed from its session id; null for anything else. */
export function realRunSource(sessionId: string): RealRunSource | null {
  const jenkins = JENKINS_SESSION_PATTERN.exec(sessionId);
  if (jenkins) return { source: "jenkins", job: jenkins[1], build: Number(jenkins[2]) };
  if (GUARD_SESSION_PATTERN.test(sessionId)) return { source: "guard", job: null, build: null };
  if (MCP_SESSION_PATTERN.test(sessionId)) return { source: "mcp", job: null, build: null };
  return null;
}

export type RunRow = Pick<
  AuditLogResponse,
  "requestId" | "sessionId" | "tool" | "action" | "resource" | "decision" | "authorizationResult" | "escalatedBy" | "timestamp"
> &
  Partial<Pick<AuditLogResponse, "claimedRequestId">>;

export type RunReview = Pick<
  ReviewRequestResponse,
  "id" | "requestId" | "status" | "expired" | "expiresAt" | "consumedAt" | "reviewer" | "note" | "reviewedAt"
>;

export interface PipelineRun {
  sessionId: string;
  kind: RunKind;
  /** The pipeline slug from the session id, e.g. "deploy-staging"; for a real run, the Jenkins job or "guard". */
  slug: string;
  /** The catalog scenario whose pipeline name gives this slug, or null ("Unknown pipeline"; always for real runs). */
  scenario: PipelineScenario | null;
  /** Jenkins job and build of a real run; null for a simulator run. */
  real: RealRunSource | null;
  /** The run's rows, oldest first. */
  rows: RunRow[];
  startedAt: string;
  lastActivityAt: string;
  /**
   * True when the sample was full and this run holds its oldest row: earlier rows of the run may lie
   * outside the sample, so its first steps can be missing.
   */
  possiblyTruncated: boolean;
}

/** Same slug rule as enforcement.new_session_id: lower case, non-alphanumerics to "-", trimmed, 32 chars. */
export function pipelineSlug(pipelineName: string): string {
  const slug = Array.from(pipelineName.toLowerCase(), (ch) => (/[a-z0-9]/.test(ch) ? ch : "-"))
    .join("")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);
  return slug || "pipeline";
}

/** The run's title: "Jenkins · <job> #<build>", "Guard run", "MCP proxy session", its scenario's title, or "Unknown pipeline". */
export function runTitle(run: Pick<PipelineRun, "scenario"> & Partial<Pick<PipelineRun, "real">>): string {
  if (run.real?.source === "jenkins") return `Jenkins · ${run.real.job} #${run.real.build}`;
  if (run.real?.source === "guard") return "Guard run";
  if (run.real?.source === "mcp") return "MCP proxy session";
  return run.scenario?.title ?? "Unknown pipeline";
}

function time(iso: string): number {
  const value = Date.parse(iso);
  return Number.isFinite(value) ? value : 0;
}

/**
 * Groups rows into runs, newest run first (by each run's first row): simulator runs (kind "simulator") and real
 * guarded runs (kind "real", never matched to the catalog). Rows whose session id is neither are left out. An
 * unknown simulator slug still makes a run, with scenario null, so it is not hidden.
 * `sampleLimit` is the page size the rows came from; it only feeds possiblyTruncated.
 */
export function groupRuns(
  rows: readonly RunRow[],
  scenarios: readonly PipelineScenario[] = PIPELINE_SCENARIOS,
  options: { sampleLimit?: number } = {},
): PipelineRun[] {
  const bySlug = new Map(scenarios.map((scenario) => [pipelineSlug(scenario.pipelineName), scenario]));
  const groups = new Map<string, { slug: string; real: RealRunSource | null; rows: { row: RunRow; order: number }[] }>();

  rows.forEach((row, order) => {
    // "Approval claimed" rows (V14) repeat a held step; the run already shows the claim from that step's review.
    if (row.claimedRequestId) return;
    let group = groups.get(row.sessionId);
    if (!group) {
      const match = RUN_SESSION_PATTERN.exec(row.sessionId);
      const real = match ? null : realRunSource(row.sessionId);
      if (match) group = { slug: match[1], real: null, rows: [] };
      else if (real) group = { slug: real.job ?? real.source, real, rows: [] };
      else return;
    }
    group.rows.push({ row, order });
    groups.set(row.sessionId, group);
  });

  const sampleFull = options.sampleLimit !== undefined && rows.length >= options.sampleLimit;
  const oldest = rows.reduce<RunRow | undefined>((min, row) => (min === undefined || time(row.timestamp) < time(min.timestamp) ? row : min), undefined);

  const runs = Array.from(groups, ([sessionId, group]): PipelineRun => {
    // Oldest first. The API lists newest first, so on a timestamp tie the later index is the earlier row.
    const ordered = group.rows
      .sort((a, b) => time(a.row.timestamp) - time(b.row.timestamp) || b.order - a.order)
      .map((entry) => entry.row);
    return {
      sessionId,
      kind: group.real ? "real" : "simulator",
      slug: group.slug,
      scenario: group.real ? null : (bySlug.get(group.slug) ?? null),
      real: group.real,
      rows: ordered,
      startedAt: ordered[0].timestamp,
      lastActivityAt: ordered[ordered.length - 1].timestamp,
      possiblyTruncated: sampleFull && oldest !== undefined && ordered.includes(oldest),
    };
  });

  return runs.sort((a, b) => time(b.startedAt) - time(a.startedAt) || a.sessionId.localeCompare(b.sessionId));
}

/* ---------------------------------------------------------------------------------------------- */
/* Steps                                                                                           */

export const STEP_STATUSES = [
  "EXECUTED",
  "WAITING",
  "APPROVED_EXECUTED",
  "APPROVED_UNCLAIMED",
  "REJECTED",
  "EXPIRED",
  "BLOCKED",
  "REVIEW_UNKNOWN",
  "SKIPPED",
  "NOT_STARTED",
] as const;
export type StepStatus = (typeof STEP_STATUSES)[number];

export type StatusTone = "success" | "warning" | "danger" | "muted";

export const STEP_STATUS_META: Record<StepStatus, { label: string; tone: StatusTone; detail: string }> = {
  EXECUTED: { label: "Allowed, executed", tone: "success", detail: "The gateway allowed it, so the mock tool ran." },
  WAITING: { label: "Waiting for review", tone: "warning", detail: "Sent to review. Nothing runs until an operator decides." },
  APPROVED_EXECUTED: {
    label: "Approved, executed",
    tone: "success",
    detail: "An operator approved it and the agent claimed the approval, so the mock tool ran.",
  },
  APPROVED_UNCLAIMED: {
    label: "Approved, not claimed",
    tone: "warning",
    detail: "Approved. The agent has not claimed the approval yet, so nothing has run.",
  },
  REJECTED: { label: "Rejected", tone: "danger", detail: "An operator rejected it. The pipeline stopped here." },
  EXPIRED: { label: "Review expired", tone: "danger", detail: "The review expired before the approval was used. Nothing ran." },
  BLOCKED: { label: "Blocked", tone: "danger", detail: "The gateway denied it. The pipeline stopped here." },
  REVIEW_UNKNOWN: {
    label: "Sent to review",
    tone: "warning",
    detail: "Sent to review, but the review is not in the loaded review lists, so its state is not known here.",
  },
  SKIPPED: { label: "Skipped", tone: "muted", detail: "No decision was recorded for this step." },
  NOT_STARTED: { label: "Not started", tone: "muted", detail: "No request recorded yet." },
};

/** Wording for real runs where the simulator wording would claim more than AgentShield records. */
const REAL_STEP_TEXT: Partial<Record<StepStatus, { label: string; detail: string }>> = {
  EXECUTED: {
    label: "Allowed",
    detail: "The gateway allowed it. The guard runs the command only after redeeming the decision; its result is in Jenkins.",
  },
  APPROVED_EXECUTED: {
    label: "Approved, claimed",
    detail: "An operator approved it and the guard claimed the approval, then redeemed it before running the command.",
  },
  APPROVED_UNCLAIMED: {
    label: "Approved, not claimed",
    detail: "Approved. The guard has not claimed the approval yet, so the command has not run.",
  },
  BLOCKED: { label: "Blocked", detail: "The gateway denied it, so the guard did not run the command and the stage failed." },
  WAITING: { label: "Waiting for review", detail: "Sent to review. The build is paused until an operator decides." },
};

/** Details for MCP proxy sessions, where the proxy (not the guard or Jenkins) redeems and calls the tool. */
const MCP_STEP_DETAIL: Partial<Record<StepStatus, string>> = {
  EXECUTED: "The gateway allowed it. The MCP proxy calls the tool only after redeeming the decision.",
  APPROVED_EXECUTED: "An operator approved it and the MCP proxy claimed the approval, then redeemed it before calling the tool.",
  APPROVED_UNCLAIMED: "Approved. The agent has not retried the call yet, so the tool has not run.",
  BLOCKED: "The gateway denied it, so the MCP proxy did not call the tool.",
  WAITING: "Sent to review. The agent's call is held until an operator decides.",
};

/** Label and detail for a step status, worded for the kind of run (and, for a real run, its source). */
export function stepStatusText(
  status: StepStatus,
  kind: RunKind = "simulator",
  source: RealRunSource["source"] | null = null,
): { label: string; detail: string } {
  const base = STEP_STATUS_META[status];
  const real = kind === "real" ? REAL_STEP_TEXT[status] : undefined;
  const text = real ?? { label: base.label, detail: base.detail };
  const mcpDetail = kind === "real" && source === "mcp" ? MCP_STEP_DETAIL[status] : undefined;
  return mcpDetail ? { label: text.label, detail: mcpDetail } : text;
}

export interface RunStep {
  /** 1-based position in the pipeline. */
  index: number;
  tool: string;
  action: RunRow["action"];
  resource: string;
  /** Catalog summary; null for a step of an unknown pipeline. */
  summary: string | null;
  status: StepStatus;
  row: RunRow | null;
  review: RunReview | null;
  /** The gate that denied it, for BLOCKED only. */
  gate: Gate | null;
}

/** Statuses after which the simulator does not go on (it fails closed and halts by default). */
const TERMINAL_HALTS: ReadonlySet<StepStatus> = new Set(["BLOCKED", "REJECTED", "EXPIRED"]);

function statusForRow(row: RunRow, review: RunReview | undefined, now: number): StepStatus {
  if (row.decision === "ALLOW") return "EXECUTED";
  if (row.decision === "DENY") return "BLOCKED";
  if (!review) return "REVIEW_UNKNOWN";
  if (review.status === "REJECTED") return "REJECTED";
  if (review.status === "APPROVED" && review.consumedAt) return "APPROVED_EXECUTED";
  // An open review, or an approval nobody claimed, is dead once expired.
  if (isEffectivelyExpired(review, now)) return "EXPIRED";
  return review.status === "APPROVED" ? "APPROVED_UNCLAIMED" : "WAITING";
}

/**
 * One entry per catalog step, in order (or one per row for an unknown pipeline).
 *
 * Rows are matched to steps in order on tool, action and resource. A step with no row is SKIPPED when the run
 * has already stopped (an earlier step was blocked, rejected or expired) or a later step has a row; otherwise
 * it is NOT_STARTED, because the run may still be going (for example, waiting on a review).
 */
export function runSteps(
  run: Pick<PipelineRun, "rows">,
  scenario: PipelineScenario | null,
  reviewsByRequestId: ReadonlyMap<string, RunReview>,
  now: number = Date.now(),
): RunStep[] {
  const build = (index: number, step: Pick<RunStep, "tool" | "action" | "resource" | "summary">, row: RunRow | null): RunStep => {
    const review = row && row.decision === "REVIEW" ? reviewsByRequestId.get(row.requestId) : undefined;
    const status = row ? statusForRow(row, review, now) : "NOT_STARTED";
    return {
      index,
      ...step,
      status,
      row,
      review: review ?? null,
      gate: row && status === "BLOCKED" ? gateFor(row) : null,
    };
  };

  if (!scenario) {
    return run.rows.map((row, i) =>
      build(i + 1, { tool: row.tool, action: row.action, resource: row.resource, summary: null }, row),
    );
  }

  let cursor = 0;
  const matched = scenario.steps.map((step) => {
    for (let i = cursor; i < run.rows.length; i += 1) {
      const row = run.rows[i];
      if (row.tool === step.tool && row.action === step.action && row.resource === step.resource) {
        cursor = i + 1;
        return row;
      }
    }
    return null;
  });

  const steps = scenario.steps.map((step, i) =>
    build(i + 1, { tool: step.tool, action: step.action, resource: step.resource, summary: step.summary }, matched[i]),
  );

  let halted = false;
  return steps.map((step, i) => {
    if (step.row) {
      if (TERMINAL_HALTS.has(step.status)) halted = true;
      return step;
    }
    const laterRow = matched.slice(i + 1).some((row) => row !== null);
    return halted || laterRow ? { ...step, status: "SKIPPED" } : step;
  });
}

/* ---------------------------------------------------------------------------------------------- */
/* Run status                                                                                      */

export const RUN_STATUSES = ["SUCCEEDED", "WAITING", "BLOCKED", "REJECTED", "EXPIRED", "RUNNING"] as const;
export type RunStatus = (typeof RUN_STATUSES)[number];

export const RUN_STATUS_META: Record<RunStatus, { label: string; tone: StatusTone }> = {
  SUCCEEDED: { label: "Succeeded", tone: "success" },
  WAITING: { label: "Waiting for review", tone: "warning" },
  BLOCKED: { label: "Blocked", tone: "danger" },
  REJECTED: { label: "Rejected", tone: "danger" },
  EXPIRED: { label: "Expired", tone: "danger" },
  RUNNING: { label: "Running", tone: "muted" },
};

const DONE: ReadonlySet<StepStatus> = new Set(["EXECUTED", "APPROVED_EXECUTED"]);

/**
 * A real run whose recorded steps were all authorized is labelled "Authorized", not "Succeeded": AgentShield does
 * not see whether the commands then succeeded, or whether the build has more stages to come.
 */
export function runStatusLabel(status: RunStatus, kind: RunKind = "simulator"): string {
  if (kind === "real" && status === "SUCCEEDED") return "Authorized";
  return RUN_STATUS_META[status].label;
}

/**
 * The first step that did not run decides:
 * BLOCKED or SKIPPED -> Blocked (a skipped step with later rows means the simulator failed closed on it),
 * REJECTED -> Rejected, EXPIRED -> Expired, WAITING or REVIEW_UNKNOWN -> Waiting for review,
 * APPROVED_UNCLAIMED or NOT_STARTED -> Running. Every step done -> Succeeded. No steps -> Running.
 */
export function runStatus(steps: readonly Pick<RunStep, "status">[]): RunStatus {
  if (steps.length === 0) return "RUNNING";
  const first = steps.find((step) => !DONE.has(step.status));
  if (!first) return "SUCCEEDED";
  switch (first.status) {
    case "BLOCKED":
    case "SKIPPED":
      return "BLOCKED";
    case "REJECTED":
      return "REJECTED";
    case "EXPIRED":
      return "EXPIRED";
    case "WAITING":
    case "REVIEW_UNKNOWN":
      return "WAITING";
    default:
      return "RUNNING";
  }
}

/** Running and waiting runs can still change, so they are polled quickly. */
export function isLiveStatus(status: RunStatus): boolean {
  return status === "RUNNING" || status === "WAITING";
}

/** Poll intervals: fast while the selected run can still change, slow otherwise. */
export const LIVE_REFRESH_MS = 4_000;
export const IDLE_REFRESH_MS = 30_000;

/**
 * A "Running" run with no new request for this long has most likely stopped without a recorded decision
 * (for example the simulator was interrupted), so it is no longer polled quickly. A run waiting for review
 * stays fast until the review is decided or expires.
 */
export const STALE_RUN_MS = 10 * 60_000;

export function pollIntervalFor(
  status: RunStatus | undefined,
  lastActivityAt: string | undefined,
  now: number,
  kind: RunKind = "simulator",
): number {
  if (status === "WAITING") return LIVE_REFRESH_MS;
  const recent = lastActivityAt !== undefined && now - time(lastActivityAt) < STALE_RUN_MS;
  if (status === "RUNNING" && recent) return LIVE_REFRESH_MS;
  // A real build whose steps so far were all authorized may still have stages to come.
  if (kind === "real" && status === "SUCCEEDED" && recent) return LIVE_REFRESH_MS;
  return IDLE_REFRESH_MS;
}

/** Splits runs (or entries holding a run) into real and simulator groups, keeping their order. */
export function splitByKind<T extends { run: Pick<PipelineRun, "kind"> }>(entries: readonly T[]): { real: T[]; simulator: T[] } {
  return {
    real: entries.filter((entry) => entry.run.kind === "real"),
    simulator: entries.filter((entry) => entry.run.kind === "simulator"),
  };
}

/* ---------------------------------------------------------------------------------------------- */
/* Changes                                                                                         */

export interface StepChange {
  index: number;
  from: StepStatus;
  to: StepStatus;
}

/** Steps whose status differs between two snapshots of the same run, matched by index. */
export function diffSteps(previous: readonly Pick<RunStep, "index" | "status">[], next: readonly Pick<RunStep, "index" | "status">[]): StepChange[] {
  const before = new Map(previous.map((step) => [step.index, step.status]));
  const changes: StepChange[] = [];
  for (const step of next) {
    const from = before.get(step.index) ?? "NOT_STARTED";
    if (from !== step.status) changes.push({ index: step.index, from, to: step.status });
  }
  return changes;
}

/** Sentence for the live region, e.g. "Step 3 approved by Sagar, executed." Null for NOT_STARTED. */
export function describeStep(step: Pick<RunStep, "index" | "status" | "review" | "gate">, kind: RunKind = "simulator"): string | null {
  const who = step.review?.reviewer?.trim() || "an operator";
  const lead = `Step ${step.index}`;
  const real = kind === "real";
  switch (step.status) {
    case "EXECUTED":
      return real ? `${lead} allowed.` : `${lead} allowed, executed.`;
    case "WAITING":
      return `${lead} sent to review, waiting for an operator.`;
    case "APPROVED_EXECUTED":
      return real ? `${lead} approved by ${who}, claimed.` : `${lead} approved by ${who}, executed.`;
    case "APPROVED_UNCLAIMED":
      return `${lead} approved by ${who}, waiting for the agent to claim it.`;
    case "REJECTED":
      return `${lead} rejected by ${who}.`;
    case "EXPIRED":
      return `${lead} review expired. Nothing ran.`;
    case "BLOCKED":
      return `${lead} blocked at the ${GATE_LABELS[step.gate ?? "POLICY"]} gate.`;
    case "REVIEW_UNKNOWN":
      return `${lead} sent to review.`;
    case "SKIPPED":
      return `${lead} skipped.`;
    case "NOT_STARTED":
      return null;
  }
}

/** Indexes reviews by the request that created them. */
export function reviewsByRequest(reviews: readonly RunReview[]): Map<string, RunReview> {
  return new Map(reviews.map((review) => [review.requestId, review]));
}
