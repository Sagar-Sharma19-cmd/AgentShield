/**
 * Recent activity for one agent, from the audit sample `useAgentAuditSample` loads (the newest
 * AGENT_SAMPLE_SIZE rows whose recorded agentId is this agent's name). Pure; tested in
 * activity-sample.test.ts. Every count is over that sample only, never an all-time total.
 */
import { GATES, gateFor, type Gate } from "@/lib/checkpoint/gates";
import type { AuditLogResponse, DecisionType } from "@/types/api";

export type ActivityRow = Pick<
  AuditLogResponse,
  "requestId" | "timestamp" | "tool" | "action" | "resource" | "decision" | "authorizationResult" | "escalatedBy"
>;

export interface GateCount {
  gate: Gate;
  count: number;
  /** count / sample size, 0–1. Zero for an empty sample. */
  share: number;
}

/** How many sampled requests each gate decided, in pipeline order. Every gate is listed, including zeros. */
export function gateBreakdown(rows: readonly Pick<ActivityRow, "authorizationResult" | "decision" | "escalatedBy">[]): GateCount[] {
  const counts = new Map<Gate, number>(GATES.map((gate) => [gate, 0]));
  for (const row of rows) {
    const gate = gateFor(row);
    counts.set(gate, (counts.get(gate) ?? 0) + 1);
  }
  const total = rows.length;
  return GATES.map((gate) => {
    const count = counts.get(gate) ?? 0;
    return { gate, count, share: total > 0 ? count / total : 0 };
  });
}

/** Counts per final decision over the sample. */
export function decisionCounts(rows: readonly Pick<ActivityRow, "decision">[]): Record<DecisionType, number> {
  const counts: Record<DecisionType, number> = { ALLOW: 0, REVIEW: 0, DENY: 0 };
  for (const row of rows) counts[row.decision] += 1;
  return counts;
}

export interface RecentActivityItem extends Pick<ActivityRow, "requestId" | "timestamp" | "tool" | "action" | "resource" | "decision"> {
  gate: Gate;
}

/** Number of rows the compact list shows. The breakdown still covers the whole sample. */
export const RECENT_ACTIVITY_LIMIT = 8;

/** The first `limit` rows (the audit API returns newest first), each with its deciding gate. */
export function recentActivity(rows: readonly ActivityRow[], limit: number = RECENT_ACTIVITY_LIMIT): RecentActivityItem[] {
  return rows.slice(0, Math.max(0, limit)).map((row) => ({
    requestId: row.requestId,
    timestamp: row.timestamp,
    tool: row.tool,
    action: row.action,
    resource: row.resource,
    decision: row.decision,
    gate: gateFor(row),
  }));
}

/** "Latest 100 requests", or the actual count when the agent has fewer. */
export function sampleLabel(sampleSize: number, total: number): string {
  const shown = Math.min(sampleSize, total);
  return total >= sampleSize ? `Latest ${sampleSize} requests` : `Latest ${shown} ${shown === 1 ? "request" : "requests"}`;
}
