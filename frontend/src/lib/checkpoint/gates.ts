/**
 * "Checkpoint" model: where in the gateway pipeline each audited request was decided.
 *
 * The gateway evaluates every request in a fixed order (docs/architecture.md):
 *   Identity -> Permission -> Policy -> Risk Engine -> Trajectory -> decision.
 * An audit row records the authorization result, the final decision and, since V9, which stage
 * escalated it (escalatedBy). gateFor() maps a row onto the stage that produced its final outcome.
 * It reads recorded fields only; it never re-scores or infers anything the backend did not record.
 *
 * Pure: no React, no fetching. Tested in gates.test.ts.
 */
import type { AuditLogResponse, AuthorizationResult, DecisionType, RiskTier } from "@/types/api";

export const GATES = ["IDENTITY", "PERMISSION", "POLICY", "RISK_ENGINE", "TRAJECTORY", "PASSED"] as const;
export type Gate = (typeof GATES)[number];

/** Short display labels, in pipeline order. "PASSED" is shown as the end of the line: Allowed. */
export const GATE_LABELS: Record<Gate, string> = {
  IDENTITY: "Identity",
  PERMISSION: "Permission",
  POLICY: "Policy",
  RISK_ENGINE: "Risk engine",
  TRAJECTORY: "Trajectory",
  PASSED: "Allowed",
};

/** Position of each gate in the pipeline (0 = first). */
export const GATE_INDEX: Record<Gate, number> = Object.fromEntries(GATES.map((gate, index) => [gate, index])) as Record<
  Gate,
  number
>;

/** Results produced by the PermissionEngine's identity checks (agent exists, is active, matches the key). */
export const IDENTITY_RESULTS: ReadonlySet<AuthorizationResult> = new Set<AuthorizationResult>([
  "AGENT_NOT_FOUND",
  "AGENT_SUSPENDED",
  "AGENT_REVOKED",
  "AGENT_IDENTITY_MISMATCH",
]);

/** Results produced by the PermissionEngine's tool and grant checks. */
export const PERMISSION_RESULTS: ReadonlySet<AuthorizationResult> = new Set<AuthorizationResult>([
  "TOOL_NOT_FOUND",
  "TOOL_DISABLED",
  "UNAUTHORIZED",
  "PERMISSION_DISABLED",
]);

export type GateInput = Pick<AuditLogResponse, "authorizationResult" | "decision" | "escalatedBy">;

/**
 * The gate that decided a request.
 *
 * | authorizationResult            | decision | escalatedBy          | gate        |
 * |--------------------------------|----------|----------------------|-------------|
 * | AGENT_* (identity results)     | any      | any                  | IDENTITY    |
 * | TOOL_*, UNAUTHORIZED, PERM_*   | any      | any                  | PERMISSION  |
 * | AUTHORIZED                     | ALLOW    | any                  | PASSED      |
 * | AUTHORIZED                     | DENY     | RISK_ENGINE          | RISK_ENGINE |
 * | AUTHORIZED                     | DENY     | NONE/TRAJECTORY/null | POLICY      |
 * | AUTHORIZED                     | REVIEW   | TRAJECTORY           | TRAJECTORY  |
 * | AUTHORIZED                     | REVIEW   | RISK_ENGINE          | RISK_ENGINE |
 * | AUTHORIZED                     | REVIEW   | NONE/null            | POLICY      |
 *
 * escalatedBy is null on rows written before escalation tracking (V9). Those non-ALLOW rows fall
 * back to POLICY: the recorded data cannot say a later stage was involved, so none is claimed.
 * Trajectory never produces DENY, so DENY + TRAJECTORY is not expected; it is treated as POLICY.
 */
export function gateFor(row: GateInput): Gate {
  if (IDENTITY_RESULTS.has(row.authorizationResult)) return "IDENTITY";
  if (PERMISSION_RESULTS.has(row.authorizationResult)) return "PERMISSION";
  if (row.decision === "ALLOW") return "PASSED";
  if (row.decision === "DENY") return row.escalatedBy === "RISK_ENGINE" ? "RISK_ENGINE" : "POLICY";
  if (row.escalatedBy === "TRAJECTORY") return "TRAJECTORY";
  if (row.escalatedBy === "RISK_ENGINE") return "RISK_ENGINE";
  return "POLICY";
}

/* ---------------------------------------------------------------------------------------------- */
/* Funnel                                                                                          */
/* ---------------------------------------------------------------------------------------------- */

export const FUNNEL_STAGES = ["REQUESTS", "AUTHORIZED", "PASSED_POLICY", "PASSED_RISK", "ALLOWED"] as const;
export type FunnelStageId = (typeof FUNNEL_STAGES)[number];

export const FUNNEL_LABELS: Record<FunnelStageId, string> = {
  REQUESTS: "Requests",
  AUTHORIZED: "Authorized",
  PASSED_POLICY: "Passed policy",
  PASSED_RISK: "Passed risk",
  ALLOWED: "Allowed",
};

/** A row counts toward a stage when its deciding gate lies at or beyond this pipeline index. */
const FUNNEL_MIN_GATE_INDEX: Record<FunnelStageId, number> = {
  REQUESTS: 0,
  AUTHORIZED: GATE_INDEX.POLICY,
  PASSED_POLICY: GATE_INDEX.RISK_ENGINE,
  PASSED_RISK: GATE_INDEX.TRAJECTORY,
  ALLOWED: GATE_INDEX.PASSED,
};

export interface FunnelStage {
  id: FunnelStageId;
  label: string;
  count: number;
  /** count / requests, 0–1. Zero for an empty sample, so callers never divide by zero. */
  share: number;
}

/**
 * How many of the given rows got past each gate. Counts only the rows passed in (a sample), never
 * an all-time total. Each stage is a subset of the one before, so counts never increase.
 */
export function funnel(rows: readonly GateInput[]): FunnelStage[] {
  const gateIndexes = rows.map((row) => GATE_INDEX[gateFor(row)]);
  const total = rows.length;
  return FUNNEL_STAGES.map((id) => {
    const count = gateIndexes.filter((index) => index >= FUNNEL_MIN_GATE_INDEX[id]).length;
    return { id, label: FUNNEL_LABELS[id], count, share: total > 0 ? count / total : 0 };
  });
}

/* ---------------------------------------------------------------------------------------------- */
/* Sessions                                                                                        */
/* ---------------------------------------------------------------------------------------------- */

export type SessionRow = Pick<
  AuditLogResponse,
  "requestId" | "sessionId" | "agentId" | "timestamp" | "decision" | "trajectoryScore" | "authorizationResult" | "escalatedBy"
>;

export interface TracePoint {
  requestId: string;
  timestamp: string;
  decision: DecisionType;
  /** Null when trajectory analysis did not run for this request (for example, it was denied first). */
  trajectoryScore: number | null;
  gate: Gate;
}

function timeOf(timestamp: string): number {
  const value = Date.parse(timestamp);
  return Number.isNaN(value) ? 0 : value;
}

/**
 * Requests of one session in time order (oldest first). Rows with equal timestamps keep their
 * relative order from the input, reversed, because the audit API returns newest first.
 */
export function sessionTrace(rows: readonly SessionRow[], sessionId: string): TracePoint[] {
  return rows
    .map((row, index) => ({ row, index }))
    .filter(({ row }) => row.sessionId === sessionId)
    .sort((a, b) => timeOf(a.row.timestamp) - timeOf(b.row.timestamp) || b.index - a.index)
    .map(({ row }) => ({
      requestId: row.requestId,
      timestamp: row.timestamp,
      decision: row.decision,
      trajectoryScore: row.trajectoryScore,
      gate: gateFor(row),
    }));
}

export interface EscalatedSession {
  sessionId: string;
  agentId: string;
  /** Highest trajectory score recorded for this session within the sample. */
  peakScore: number;
  /** Timestamp of the request that reached the peak. */
  peakAt: string;
}

/**
 * The session with the highest trajectory score in the sample, or null when no row has one.
 * Ties go to the session whose peak is more recent, then to the one listed first.
 */
export function mostEscalatedSession(rows: readonly SessionRow[]): EscalatedSession | null {
  let best: EscalatedSession | null = null;
  for (const row of rows) {
    const score = row.trajectoryScore;
    if (score === null || !Number.isFinite(score)) continue;
    const better =
      best === null || score > best.peakScore || (score === best.peakScore && timeOf(row.timestamp) > timeOf(best.peakAt));
    if (better) {
      best = { sessionId: row.sessionId, agentId: row.agentId, peakScore: score, peakAt: row.timestamp };
    }
  }
  return best;
}

/** Score threshold where trajectory analysis may escalate an ALLOW to REVIEW (HIGH tier). */
export const HIGH_RISK_THRESHOLD = 60;

/**
 * Tier for a 0–100 score, using the bands shared by the Risk Engine and trajectory analysis
 * (LOW 0–29, MEDIUM 30–59, HIGH 60–79, CRITICAL 80–100). Out-of-range scores are clamped.
 */
export function riskTierForScore(score: number): RiskTier {
  const clamped = Math.min(100, Math.max(0, score));
  if (clamped >= 80) return "CRITICAL";
  if (clamped >= HIGH_RISK_THRESHOLD) return "HIGH";
  if (clamped >= 30) return "MEDIUM";
  return "LOW";
}
