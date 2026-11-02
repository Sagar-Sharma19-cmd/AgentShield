import type { ActionType, AuthorizationResult, DecisionType, EscalationSource, RiskTier } from "@/types/api";
import { parseEscalationSource, parseRiskTier, parseTrajectoryReason, parseTrajectoryScore } from "@/lib/trajectory/model";

/**
 * Decisions that raise a security alert. ALLOW is routine traffic and never alerts.
 * Risk tier is NOT an alert trigger, and no tier is derived from the policy score. The only tier
 * shown is the trajectory tier, and it is displayed but does not change which alerts exist.
 */
export const ALERT_DECISIONS = ["DENY", "REVIEW"] as const satisfies readonly DecisionType[];
export type AlertDecision = (typeof ALERT_DECISIONS)[number];

/** Rows fetched per decision, per poll. The backend caps `size` at 100 (AuditController.MAX_PAGE_SIZE). */
export const ALERT_PAGE_SIZE = 50;
/** Rows kept in the merged feed. */
export const ALERT_FEED_LIMIT = 25;

/** A normalised alert. Optional audit fields are null when absent, so the UI never assumes they exist. */
export interface SecurityAlert {
  /** Stable per gateway evaluation (one audit row per requestId). Used for deduplication. */
  requestId: string;
  decision: AlertDecision;
  timestamp: string;
  agentId: string;
  tool: string;
  action: ActionType | null;
  resource: string;
  reason: string;
  /** PolicyEngine score, 0-100. Not a Risk Engine tier, and not a trajectory score. */
  policyRiskScore: number | null;
  authorizationResult: AuthorizationResult | null;
  /** Trajectory signal, 0-100. Null when trajectory was not evaluated or the row is legacy. */
  trajectoryScore: number | null;
  trajectoryTier: RiskTier | null;
  trajectoryReason: string | null;
  /** Null when not recorded (legacy row). TRAJECTORY means trajectory raised an ALLOW to REVIEW. */
  escalatedBy: EscalationSource | null;
}

const ALERT_DECISION_SET: ReadonlySet<string> = new Set(ALERT_DECISIONS);

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asFiniteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * Converts one raw audit row into an alert. Returns null when the row cannot be shown safely:
 * it is not an object, its requestId is missing, its decision is not DENY or REVIEW, or its
 * timestamp cannot be parsed (the timestamp is needed for ordering). Every other field is optional.
 */
export function toAlert(raw: unknown): SecurityAlert | null {
  if (typeof raw !== "object" || raw === null) return null;
  const row = raw as Record<string, unknown>;

  const requestId = asString(row.requestId);
  const decision = asString(row.decision);
  const timestamp = asString(row.timestamp);

  if (requestId === "" || !ALERT_DECISION_SET.has(decision)) return null;
  if (Number.isNaN(Date.parse(timestamp)) || timestamp === "") return null;

  const action = asString(row.action);
  const authorizationResult = asString(row.authorizationResult);

  return {
    requestId,
    decision: decision as AlertDecision,
    timestamp,
    agentId: asString(row.agentId),
    tool: asString(row.tool),
    action: action === "" ? null : (action as ActionType),
    resource: asString(row.resource),
    reason: asString(row.reason),
    policyRiskScore: asFiniteNumber(row.riskScore),
    authorizationResult: authorizationResult === "" ? null : (authorizationResult as AuthorizationResult),
    trajectoryScore: parseTrajectoryScore(row.trajectoryScore),
    trajectoryTier: parseRiskTier(row.trajectoryTier),
    trajectoryReason: parseTrajectoryReason(row.trajectoryReason),
    escalatedBy: parseEscalationSource(row.escalatedBy),
  };
}

/** Converts a page of raw rows, dropping any row that cannot be shown. Never throws. */
export function toAlerts(rows: unknown): SecurityAlert[] {
  if (!Array.isArray(rows)) return [];
  const alerts: SecurityAlert[] = [];
  for (const row of rows) {
    const alert = toAlert(row);
    if (alert !== null) alerts.push(alert);
  }
  return alerts;
}

/** Newest first. Ties are broken by requestId so the order is deterministic. */
export function compareNewestFirst(a: SecurityAlert, b: SecurityAlert): number {
  const byTime = Date.parse(b.timestamp) - Date.parse(a.timestamp);
  if (byTime !== 0) return byTime;
  return a.requestId < b.requestId ? 1 : a.requestId > b.requestId ? -1 : 0;
}

/**
 * Merges per-decision pages into one newest-first feed. Duplicate requestIds keep the first
 * occurrence, and the result is capped at `limit`.
 */
export function mergeAlertPages(pages: readonly (readonly SecurityAlert[])[], limit: number): SecurityAlert[] {
  const byRequestId = new Map<string, SecurityAlert>();
  for (const page of pages) {
    for (const alert of page) {
      if (!byRequestId.has(alert.requestId)) byRequestId.set(alert.requestId, alert);
    }
  }
  return [...byRequestId.values()].sort(compareNewestFirst).slice(0, limit);
}
