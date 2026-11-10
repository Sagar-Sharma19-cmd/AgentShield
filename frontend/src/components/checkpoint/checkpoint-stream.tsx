"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { motion } from "motion/react";
import { Pause, Play } from "lucide-react";
import { alertDetailHref } from "@/components/alerts/security-alert-toast";
import { SectionEmpty, SectionError } from "@/components/dashboard/section-states";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { GATE_LABELS, GATES, type Gate } from "@/lib/checkpoint/gates";
import { DEFAULT_STREAM_LIMITS, dotsByGate, outcomePhrase, planStream, summarizeArrivals, type StreamDot, type StreamPlan, type StreamRow } from "@/lib/checkpoint/stream";
import { formatTimestamp } from "@/lib/format";
import { useElementWidth } from "@/lib/hooks/use-element-width";
import { ACTION_LABELS } from "@/lib/labels";
import { checkpointMotion, easings } from "@/lib/motion/tokens";
import { useRecentEvaluations } from "@/lib/queries/dashboard";
import { cn } from "@/lib/utils";
import { CheckpointPanel, MicroLabel } from "./checkpoint-panel";
import { DECISION_MARKS, DecisionIcon, DecisionLegend } from "./decision-mark";

/** Compact gate labels for narrow screens; the full label is always available to screen readers. */
const SHORT_LABELS: Record<Gate, string> = {
  IDENTITY: "ID",
  PERMISSION: "Perm",
  POLICY: "Policy",
  RISK_ENGINE: "Risk",
  TRAJECTORY: "Traj",
  PASSED: "Allow",
};

/**
 * Every recent request as a dot that travels left to right and stops at the gate that decided it.
 * Reads the existing recent-evaluations query; no extra requests.
 */
export function CheckpointStream() {
  const query = useRecentEvaluations();
  const rows = query.data?.content;
  const [paused, setPaused] = useState(false);

  return (
    <CheckpointPanel
      eyebrow="Checkpoint stream"
      title="Where each request stopped"
      description={`The ${DEFAULT_STREAM_LIMITS.maxDots} most recent requests, placed at the gate that decided them. Allowed requests travel the whole line.`}
      action={
        rows && rows.length > 0 ? (
          <Button variant="outline" size="sm" aria-pressed={paused} onClick={() => setPaused((value) => !value)}>
            {paused ? <Play aria-hidden="true" /> : <Pause aria-hidden="true" />}
            {paused ? "Resume" : "Pause"}
          </Button>
        ) : null
      }
    >
      {query.isPending ? (
        <StreamSkeleton />
      ) : query.isError && !rows ? (
        <SectionError error={query.error} onRetry={() => void query.refetch()} subject="the checkpoint stream" />
      ) : !rows || rows.length === 0 ? (
        <SectionEmpty
          title="The checkpoints are clear"
          body="Send a request through the gateway and watch it travel to the gate that decides it."
        />
      ) : (
        <StreamBody rows={rows} version={query.dataUpdatedAt} paused={paused} />
      )}
    </CheckpointPanel>
  );
}

interface StreamState {
  version: number;
  plan: StreamPlan;
  /** Text for the live region. Empty for the first plan, so page load is not announced. */
  announcement: string;
  /** Time of the data the plan was built from, for the "paused" note. */
  asOf: number;
  /** True for the plan built on first load (nothing has "arrived" yet). */
  isFirst: boolean;
}

function StreamBody({ rows, version, paused }: { rows: readonly StreamRow[]; version: number; paused: boolean }) {
  const [state, setState] = useState<StreamState | null>(null);

  // Derive a new plan when the query data changes (React's "adjust state while rendering" pattern).
  // While paused the last plan stays on screen; on resume, everything that arrived meanwhile travels in.
  let current = state;
  if (!paused && (current === null || current.version !== version)) {
    const plan = planStream(rows, current?.plan.seen ?? null);
    current = {
      version,
      plan,
      announcement: current === null ? "" : summarizeArrivals(plan.arrivals),
      asOf: version,
      isFirst: current === null,
    };
    setState(current);
  }
  if (current === null) return null;

  return <StreamGrid state={current} paused={paused} />;
}

function StreamGrid({ state, paused }: { state: StreamState; paused: boolean }) {
  const [gridRef, width] = useElementWidth<HTMLDivElement>();
  const columnWidth = width / GATES.length;
  const columns = dotsByGate(state.plan.dots);
  // Keyboard order: left to right by gate, oldest to newest within a gate.
  const ordered = GATES.flatMap((gate) => columns[gate]);
  const [focusIndex, setFocusIndex] = useState(0);
  const activeIndex = Math.min(focusIndex, Math.max(0, ordered.length - 1));
  const linkRefs = useRef(new Map<string, HTMLAnchorElement>());

  function moveFocus(next: number) {
    const clamped = Math.min(ordered.length - 1, Math.max(0, next));
    setFocusIndex(clamped);
    linkRefs.current.get(ordered[clamped]?.row.requestId ?? "")?.focus();
  }

  function onKeyDown(event: React.KeyboardEvent, index: number) {
    const moves: Record<string, number> = {
      ArrowRight: index + 1,
      ArrowDown: index + 1,
      ArrowLeft: index - 1,
      ArrowUp: index - 1,
      Home: 0,
      End: ordered.length - 1,
    };
    if (!(event.key in moves)) return;
    event.preventDefault();
    moveFocus(moves[event.key]);
  }

  const lastUpdate =
    state.announcement ||
    (state.isFirst ? `Showing the ${ordered.length} most recent requests.` : "No new requests since the last refresh.");

  return (
    <div className="flex flex-col gap-3">
      <div
        ref={gridRef}
        role="group"
        aria-label={`Checkpoint stream, ${ordered.length} requests. Arrow keys move between requests; Enter opens the audit record.`}
        className="grid grid-cols-6 overflow-hidden rounded-lg border border-border"
      >
        {GATES.map((gate, column) => (
          <div key={gate} className={cn("flex min-w-0 flex-col", column > 0 && "border-l border-dashed border-border")}>
            <div className="flex items-baseline justify-between gap-1 border-b border-dashed border-border px-1.5 py-2 sm:px-2.5">
              <MicroLabel className="truncate">
                <span aria-hidden="true" className="sm:hidden">
                  {SHORT_LABELS[gate]}
                </span>
                <span className="max-sm:sr-only">{GATE_LABELS[gate]}</span>
              </MicroLabel>
              <span className="font-mono text-[0.6875rem] tabular-nums text-muted-foreground">
                {columns[gate].length}
                <span className="sr-only"> requests</span>
              </span>
            </div>
            <ul className="flex min-h-32 flex-wrap content-start gap-1 p-1.5 sm:p-2.5" aria-label={`${GATE_LABELS[gate]} gate`}>
              {columns[gate].map((dot) => {
                const index = ordered.indexOf(dot);
                return (
                  <li key={dot.row.requestId}>
                    <Dot
                      dot={dot}
                      travelFrom={-dot.column * columnWidth}
                      tabIndex={index === activeIndex ? 0 : -1}
                      onFocus={() => setFocusIndex(index)}
                      onKeyDown={(event) => onKeyDown(event, index)}
                      refCallback={(node) => {
                        if (node) linkRefs.current.set(dot.row.requestId, node);
                        else linkRefs.current.delete(dot.row.requestId);
                      }}
                    />
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <DecisionLegend />
        {/* Visible and announced: what changed in the last refresh. */}
        <p role="status" className="text-xs text-muted-foreground">
          {paused ? `Paused at ${formatTimestamp(new Date(state.asOf).toISOString())}. ` : null}
          {lastUpdate}
        </p>
      </div>
    </div>
  );
}

interface DotProps {
  dot: StreamDot;
  travelFrom: number;
  tabIndex: number;
  onFocus: () => void;
  onKeyDown: (event: React.KeyboardEvent) => void;
  refCallback: (node: HTMLAnchorElement | null) => void;
}

/**
 * One request. The wrapper span is the only transformed element (it travels on x); it holds no
 * sticky or fixed content. MotionConfig's reducedMotion="user" drops the travel, so the dot fades in
 * at its gate. Dots that were already on screen never replay, because motion's `initial` only
 * applies on mount and each dot is keyed by requestId.
 */
function Dot({ dot, travelFrom, tabIndex, onFocus, onKeyDown, refCallback }: DotProps) {
  const { row } = dot;
  const label = `${DECISION_MARKS[row.decision].label}: ${outcomePhrase(row.decision, dot.gate)}. ${ACTION_LABELS[row.action]} ${row.resource} with ${row.tool}, agent ${row.agentId}, ${formatTimestamp(row.timestamp)}. Open audit record.`;

  return (
    <motion.span
      className="inline-flex"
      initial={dot.travels ? { x: travelFrom, opacity: 0 } : false}
      animate={{ x: 0, opacity: 1 }}
      transition={{
        x: { duration: checkpointMotion.travel, ease: easings.enter, delay: dot.order * checkpointMotion.stagger },
        opacity: { duration: checkpointMotion.travel / 2, delay: dot.order * checkpointMotion.stagger },
      }}
    >
      <Link
        ref={refCallback}
        href={alertDetailHref(row.requestId)}
        aria-label={label}
        title={label}
        tabIndex={tabIndex}
        onFocus={onFocus}
        onKeyDown={onKeyDown}
        className="flex size-6 items-center justify-center rounded-full outline-none transition-colors duration-150 hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
      >
        <DecisionIcon decision={row.decision} />
      </Link>
    </motion.span>
  );
}

function StreamSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading the checkpoint stream" className="grid grid-cols-6 overflow-hidden rounded-lg border border-border">
      {GATES.map((gate, column) => (
        <div key={gate} className={cn("flex flex-col", column > 0 && "border-l border-dashed border-border")}>
          <div className="border-b border-dashed border-border px-2.5 py-2">
            <Skeleton className="h-3 w-3/4" />
          </div>
          <div className="flex min-h-32 flex-wrap content-start gap-1.5 p-2.5">
            {Array.from({ length: column === GATES.length - 1 ? 6 : 2 }, (_, index) => (
              <Skeleton key={index} className="size-5 rounded-full" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
