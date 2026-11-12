"use client";

import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { DecisionIcon, DECISION_MARKS } from "@/components/checkpoint/decision-mark";
import { GateMark } from "@/components/checkpoint/gate-mark";
import { gateFor } from "@/lib/checkpoint/gates";
import { isOutputCheck, OUTPUT_CHECK_LABEL, outputCheckSummary, SESSION_SOURCE_LABELS, sessionSource } from "@/lib/activity/source";
import { relativeTime } from "@/lib/activity/table-model";
import { ACTION_LABELS } from "@/lib/labels";
import { formatTimestamp } from "@/lib/format";
import { durations, easings, staggerDelay } from "@/lib/motion/tokens";
import { cn } from "@/lib/utils";
import type { AuditLogResponse } from "@/types/api";

/** Rows only animate within this window after a new page mounts; rows added later by a refetch appear instantly. */
const ENTRANCE_WINDOW_MS = 600;
/** Relative times are recomputed this often. */
const NOW_TICK_MS = 30_000;

/** Which layout a row button belongs to, so keyboard navigation can focus the visible one. */
export type RowLayout = "table" | "list";

interface ActivityListProps {
  events: AuditLogResponse[];
  selectedRequestId?: string;
  onSelect: (requestId: string) => void;
  /** Dims the list while a newer page is loading. */
  isUpdating: boolean;
  /** Registers each row's open button, so J/K can move focus between rows. */
  registerRow: (layout: RowLayout, index: number, node: HTMLButtonElement | null) => void;
  /** Called when a row button receives focus (by Tab, click or J/K). */
  onRowFocus: (index: number) => void;
}

/**
 * md and up: a dense table with a sticky header inside its own scroll area (a page-level sticky
 * header would not survive the horizontal scroll container). Below md: a compact list with the same
 * fields, so nothing is cut off. Every row has one button that opens the detail sheet.
 */
export function ActivityList({ events, selectedRequestId, onSelect, isUpdating, registerRow, onRowFocus }: ActivityListProps) {
  const now = useNow();
  const entering = useEntranceWindow();
  const reduceMotion = useReducedMotion();
  const each = staggerDelay(events.length);

  function entrance(index: number) {
    if (!entering || reduceMotion) return { initial: false as const };
    return {
      initial: { opacity: 0 },
      animate: { opacity: 1 },
      transition: { duration: durations.base, ease: easings.enter, delay: index * each },
    };
  }

  return (
    <div
      aria-busy={isUpdating || undefined}
      className={cn("transition-opacity duration-150 motion-reduce:transition-none", isUpdating && "opacity-60")}
    >
      <div className="hidden max-h-[min(70vh,52rem)] overflow-auto rounded-xl border border-border bg-card md:block">
        <table className="w-full min-w-[60rem] table-fixed border-separate border-spacing-0 text-sm">
          <caption className="sr-only">
            Runtime activity, newest first. Each row opens the decision detail. Press J or K to move between rows.
          </caption>
          <thead>
            <tr>
              <HeadCell className="w-36">Time</HeadCell>
              <HeadCell className="w-[20%]">Agent</HeadCell>
              <HeadCell className="w-[14%]">Tool</HeadCell>
              <HeadCell className="w-28">Action</HeadCell>
              <HeadCell>Resource</HeadCell>
              <HeadCell className="w-32">Gate</HeadCell>
              <HeadCell className="w-40">Decision</HeadCell>
              <HeadCell className="w-16 text-right">Score</HeadCell>
            </tr>
          </thead>
          <tbody>
            {events.map((event, index) => {
              const selected = event.requestId === selectedRequestId;
              return (
                <motion.tr
                  key={event.id}
                  {...entrance(index)}
                  data-state={selected ? "selected" : undefined}
                  onClick={() => onSelect(event.requestId)}
                  className="group cursor-pointer transition-colors duration-150 hover:bg-muted/50 focus-within:bg-muted/50 data-[state=selected]:bg-muted motion-reduce:transition-none"
                >
                  <Cell className="relative">
                    {/* Selected rows get a bar as well as a fill, so selection does not depend on colour alone. */}
                    <span
                      aria-hidden="true"
                      className="absolute inset-y-1 left-0 w-0.5 rounded-full bg-foreground opacity-0 group-data-[state=selected]:opacity-100"
                    />
                    <button
                      ref={(node) => registerRow("table", index, node)}
                      type="button"
                      onClick={(click) => {
                        click.stopPropagation();
                        onSelect(event.requestId);
                      }}
                      onFocus={() => onRowFocus(index)}
                      aria-current={selected ? "true" : undefined}
                      title={formatTimestamp(event.timestamp)}
                      className="rounded-sm text-left font-mono text-xs tabular-nums text-foreground underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <time dateTime={event.timestamp}>{relativeTime(event.timestamp, now)}</time>
                      <span className="sr-only">, {formatTimestamp(event.timestamp)}. Open detail</span>
                    </button>
                  </Cell>
                  <Cell>
                    <span className="flex min-w-0 items-center gap-1.5">
                      <span title={event.agentId} className="min-w-0 truncate font-mono text-xs">
                        {event.agentId}
                      </span>
                      <SourceTag sessionId={event.sessionId} />
                    </span>
                  </Cell>
                  <Cell>
                    <Truncated value={event.tool} mono muted />
                  </Cell>
                  <Cell>{isOutputCheck(event.resource) ? OUTPUT_CHECK_LABEL : ACTION_LABELS[event.action]}</Cell>
                  <Cell>
                    <ResourceValue event={event} />
                  </Cell>
                  <Cell>
                    <GateMark gate={gateFor(event)} className="text-xs" />
                  </Cell>
                  <Cell>
                    <span className="inline-flex items-center gap-1.5">
                      <DecisionIcon decision={event.decision} />
                      {DECISION_MARKS[event.decision].label}
                    </span>
                  </Cell>
                  <Cell className="text-right font-mono tabular-nums">
                    {event.riskScore}
                    <span className="sr-only"> out of 100</span>
                  </Cell>
                </motion.tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <ul className="flex flex-col divide-y divide-border overflow-hidden rounded-xl border border-border bg-card md:hidden" aria-label="Runtime activity">
        {events.map((event, index) => {
          const selected = event.requestId === selectedRequestId;
          return (
            <motion.li key={event.id} {...entrance(index)}>
              <button
                ref={(node) => registerRow("list", index, node)}
                type="button"
                onClick={() => onSelect(event.requestId)}
                onFocus={() => onRowFocus(index)}
                aria-current={selected ? "true" : undefined}
                className={cn(
                  "flex w-full flex-col gap-1.5 border-l-2 border-transparent px-3 py-2.5 text-left outline-none transition-colors duration-150 hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset motion-reduce:transition-none",
                  selected && "border-foreground bg-muted",
                )}
              >
                <span className="flex items-center justify-between gap-3 text-xs">
                  <span className="inline-flex items-center gap-1.5 font-medium">
                    <DecisionIcon decision={event.decision} />
                    {DECISION_MARKS[event.decision].label}
                  </span>
                  <time dateTime={event.timestamp} className="font-mono tabular-nums text-muted-foreground">
                    {relativeTime(event.timestamp, now)}
                  </time>
                </span>
                <span className="flex min-w-0 items-center gap-1.5">
                  <span className="min-w-0 truncate font-mono text-xs">{event.agentId}</span>
                  <SourceTag sessionId={event.sessionId} />
                </span>
                {isOutputCheck(event.resource) ? (
                  <span className="truncate text-sm">
                    {OUTPUT_CHECK_LABEL}
                    <span className="text-muted-foreground"> · {outputCheckSummary(event)}</span>
                  </span>
                ) : (
                  <span className="truncate text-sm">
                    {ACTION_LABELS[event.action]}
                    <span className="text-muted-foreground"> on </span>
                    <span className="font-mono text-xs">{event.resource}</span>
                  </span>
                )}
                <span className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
                  <GateMark gate={gateFor(event)} />
                  <span className="font-mono tabular-nums">Score {event.riskScore}</span>
                </span>
              </button>
            </motion.li>
          );
        })}
      </ul>
    </div>
  );
}

function HeadCell({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <th
      scope="col"
      className={cn(
        "sticky top-0 z-10 h-9 border-b border-border bg-card px-3 text-left align-middle font-mono text-[0.6875rem] font-medium tracking-[0.08em] text-muted-foreground uppercase",
        className,
      )}
    >
      {children}
    </th>
  );
}

function Cell({ className, children }: { className?: string; children: React.ReactNode }) {
  return <td className={cn("h-10 border-b border-border/60 px-3 align-middle group-last:border-b-0", className)}>{children}</td>;
}

/** Which client sent the request (MCP proxy, Guard, Jenkins, Simulator), from its session id. Neutral: not a verdict. */
function SourceTag({ sessionId }: { sessionId: string }) {
  const source = sessionSource(sessionId);
  if (!source) return null;
  return (
    <span
      title={`Session ${sessionId}`}
      className="shrink-0 rounded-md border border-border px-1.5 text-[0.6875rem] leading-5 whitespace-nowrap text-muted-foreground"
    >
      {SESSION_SOURCE_LABELS[source]}
    </span>
  );
}

/** The resource, or for an output-check row ("output:<tool>") its verdict and finding types. */
function ResourceValue({ event }: { event: AuditLogResponse }) {
  if (!isOutputCheck(event.resource)) return <Truncated value={event.resource} mono muted />;
  const summary = outputCheckSummary(event);
  return (
    <span title={`${event.resource}: ${summary}`} className="block truncate text-muted-foreground">
      {summary}
    </span>
  );
}

/** One-line value with the full text on hover. */
function Truncated({ value, mono = false, muted = false }: { value: string; mono?: boolean; muted?: boolean }) {
  return (
    <span title={value} className={cn("block truncate", mono && "font-mono text-xs", muted && "text-muted-foreground")}>
      {value}
    </span>
  );
}

/** Current time, refreshed every NOW_TICK_MS, for relative timestamps. */
function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), NOW_TICK_MS);
    return () => window.clearInterval(timer);
  }, []);
  return now;
}

/** True for a short time after mount. The list is keyed by page, so this runs once per page change. */
function useEntranceWindow(): boolean {
  const [entering, setEntering] = useState(true);
  useEffect(() => {
    const timer = window.setTimeout(() => setEntering(false), ENTRANCE_WINDOW_MS);
    return () => window.clearTimeout(timer);
  }, []);
  return entering;
}
