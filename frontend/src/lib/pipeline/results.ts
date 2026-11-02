import type { AuditLogResponse, DecisionType } from "@/types/api";

export type DecisionCounts = Record<DecisionType, number>;

/** Counts decisions over rows that were actually recorded. Nothing is inferred for missing rows. */
export function countRecordedDecisions(rows: readonly Pick<AuditLogResponse, "decision">[]): DecisionCounts {
  const counts: DecisionCounts = { ALLOW: 0, REVIEW: 0, DENY: 0 };
  for (const row of rows) counts[row.decision] += 1;
  return counts;
}

/** Keeps the rows whose tool is one of the simulator's mock tools, so unrelated traffic is not shown as demo output. */
export function simulatorRowsOnly<T extends Pick<AuditLogResponse, "tool">>(rows: readonly T[], mockToolNames: readonly string[]): T[] {
  const names = new Set(mockToolNames);
  return rows.filter((row) => names.has(row.tool));
}
