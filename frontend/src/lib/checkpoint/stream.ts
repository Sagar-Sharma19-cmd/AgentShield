/**
 * Planning for the CheckpointStream: which audit rows are shown as dots, which of them animate,
 * and the text alternative that summarises new arrivals. Pure; tested in stream.test.ts.
 */
import type { AuditLogResponse, DecisionType } from "@/types/api";
import { GATE_INDEX, GATE_LABELS, GATES, gateFor, type Gate } from "./gates";

export type StreamRow = Pick<
  AuditLogResponse,
  "requestId" | "timestamp" | "decision" | "authorizationResult" | "escalatedBy" | "agentId" | "tool" | "action" | "resource"
>;

export interface StreamLimits {
  /** Most dots on screen at once. Older rows beyond this are not drawn. */
  maxDots: number;
  /** On first load, how many of the newest rows replay their travel. */
  replay: number;
  /** Most dots travelling at once; extra arrivals are placed at their gate without travel. */
  maxConcurrent: number;
}

export const DEFAULT_STREAM_LIMITS: StreamLimits = { maxDots: 40, replay: 20, maxConcurrent: 12 };

export interface StreamDot {
  row: StreamRow;
  gate: Gate;
  column: number;
  /** True when this dot should travel from the left edge when it first appears. */
  travels: boolean;
  /** Stagger slot among travelling dots, oldest first (0 = first to leave). -1 when not travelling. */
  order: number;
}

export interface StreamPlan {
  /** Dots oldest first, so newer dots append at the end of each gate column. */
  dots: StreamDot[];
  /** Rows that are new in this plan (all replayed rows on first load), newest first. */
  arrivals: StreamRow[];
  /** Request ids now on screen, to pass as `seen` next time. */
  seen: ReadonlySet<string>;
}

function timeOf(timestamp: string): number {
  const value = Date.parse(timestamp);
  return Number.isNaN(value) ? 0 : value;
}

/**
 * Builds the dots for `rows` (as the audit API returns them: newest first).
 *
 * `seen` is null on first load: the newest `replay` rows travel. Afterwards only rows whose
 * requestId is not in `seen` travel. In both cases at most `maxConcurrent` dots travel (the newest).
 */
export function planStream(
  rows: readonly StreamRow[],
  seen: ReadonlySet<string> | null,
  limits: StreamLimits = DEFAULT_STREAM_LIMITS,
): StreamPlan {
  const visible = rows.slice(0, Math.max(0, limits.maxDots));
  const arrivals = seen === null ? visible.slice(0, Math.max(0, limits.replay)) : visible.filter((row) => !seen.has(row.requestId));
  const travelling = arrivals.slice(0, Math.max(0, limits.maxConcurrent));
  // Oldest travelling dot leaves first.
  const orderById = new Map(travelling.map((row, index) => [row.requestId, travelling.length - 1 - index]));

  const dots = visible
    .map((row, index) => ({ row, index }))
    .sort((a, b) => timeOf(a.row.timestamp) - timeOf(b.row.timestamp) || b.index - a.index)
    .map(({ row }) => {
      const gate = gateFor(row);
      const order = orderById.get(row.requestId) ?? -1;
      return { row, gate, column: GATE_INDEX[gate], travels: order >= 0, order };
    });

  return { dots, arrivals, seen: new Set(visible.map((row) => row.requestId)) };
}

/** Dots grouped into the six gate columns, in pipeline order. */
export function dotsByGate(dots: readonly StreamDot[]): Record<Gate, StreamDot[]> {
  const columns = Object.fromEntries(GATES.map((gate) => [gate, [] as StreamDot[]])) as Record<Gate, StreamDot[]>;
  for (const dot of dots) columns[dot.gate].push(dot);
  return columns;
}

/** Plain-language outcome for one row, e.g. "denied at Policy" or "allowed". */
export function outcomePhrase(decision: DecisionType, gate: Gate): string {
  if (gate === "PASSED" || decision === "ALLOW") return "allowed";
  const verb = decision === "REVIEW" ? "held for review" : "denied";
  return `${verb} at ${GATE_LABELS[gate]}`;
}

/**
 * Text alternative for a batch of arrivals, e.g. "3 new: 2 allowed, 1 denied at Policy".
 * Allowed first, then held for review, then denied; each in pipeline order. Empty input gives "".
 */
export function summarizeArrivals(rows: readonly Pick<StreamRow, "decision" | "authorizationResult" | "escalatedBy">[]): string {
  if (rows.length === 0) return "";
  const counts = new Map<string, { count: number; rank: number }>();
  const decisionRank: Record<DecisionType, number> = { ALLOW: 0, REVIEW: 1, DENY: 2 };
  for (const row of rows) {
    const gate = gateFor(row);
    const phrase = outcomePhrase(row.decision, gate);
    const rank = decisionRank[gate === "PASSED" ? "ALLOW" : row.decision] * 10 + GATE_INDEX[gate];
    const entry = counts.get(phrase) ?? { count: 0, rank };
    entry.count += 1;
    counts.set(phrase, entry);
  }
  const parts = [...counts.entries()]
    .sort((a, b) => a[1].rank - b[1].rank)
    .map(([phrase, { count }]) => `${count} ${phrase}`);
  return `${rows.length} new: ${parts.join(", ")}`;
}
