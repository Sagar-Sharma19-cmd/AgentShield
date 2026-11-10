"use client";

import { SectionError } from "@/components/dashboard/section-states";
import { RiskTierBadge } from "@/components/security/risk-tier-badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  GATE_LABELS,
  HIGH_RISK_THRESHOLD,
  mostEscalatedSession,
  riskTierForScore,
  sessionTrace,
  type TracePoint,
} from "@/lib/checkpoint/gates";
import { outcomePhrase } from "@/lib/checkpoint/stream";
import { formatTimestamp, shortId } from "@/lib/format";
import { useElementWidth } from "@/lib/hooks/use-element-width";
import { useRecentEvaluations } from "@/lib/queries/dashboard";
import { cn } from "@/lib/utils";
import { CheckpointPanel, MicroLabel } from "./checkpoint-panel";
import { DECISION_MARKS, DecisionLegend } from "./decision-mark";

const HEIGHT = 196;
const PAD = { top: 12, right: 16, bottom: 34, left: 34 };
/** Lane below the axis for requests that have no trajectory score. */
const NA_LANE_OFFSET = 20;
const ICON = 14;

/**
 * Trajectory score over the requests of the most escalated session in the recent sample, with the
 * HIGH threshold (60) where trajectory analysis may escalate an ALLOW to REVIEW. The x axis is
 * request order, not wall-clock time, so bursts and gaps do not distort the line.
 */
export function SessionTrace() {
  const query = useRecentEvaluations();
  const rows = query.data?.content;
  const session = rows ? mostEscalatedSession(rows) : null;

  return (
    <CheckpointPanel
      eyebrow="Session trace"
      title="Most escalated session"
      description={`Trajectory score per request in one session. At ${HIGH_RISK_THRESHOLD} or above, an allowed request is held for review.`}
    >
      {query.isPending ? (
        <Skeleton aria-busy="true" aria-label="Loading the session trace" className="w-full" style={{ height: HEIGHT + 44 }} />
      ) : query.isError && !rows ? (
        <SectionError error={query.error} onRetry={() => void query.refetch()} subject="the session trace" />
      ) : !rows || session === null ? (
        <TraceEmpty />
      ) : (
        <SessionTraceChart
          sessionId={session.sessionId}
          agentId={session.agentId}
          peakScore={session.peakScore}
          points={sessionTrace(rows, session.sessionId)}
        />
      )}
    </CheckpointPanel>
  );
}

export interface SessionTraceChartProps {
  sessionId: string;
  agentId: string;
  /** Highest trajectory score among the points, or null when none has a score. */
  peakScore: number | null;
  /** Requests of the session, oldest first (sessionTrace()). */
  points: TracePoint[];
  /** Marks one request (for example, the one open in the Activity sheet) with a ring and "this request". */
  highlightRequestId?: string;
}

/**
 * The trace chart on its own: header line, SVG, legend and an sr-only table. Used by the Overview's
 * SessionTrace and by the Activity detail sheet.
 */
export function SessionTraceChart({ sessionId, agentId, peakScore, points, highlightRequestId }: SessionTraceChartProps) {
  const [ref, width] = useElementWidth<HTMLDivElement>();
  const plotWidth = Math.max(0, width - PAD.left - PAD.right);
  const plotHeight = HEIGHT - PAD.top - PAD.bottom;
  const xFor = (index: number) =>
    PAD.left + (points.length <= 1 ? plotWidth / 2 : (index / (points.length - 1)) * plotWidth);
  const yFor = (score: number) => PAD.top + (1 - Math.min(100, Math.max(0, score)) / 100) * plotHeight;
  const naY = PAD.top + plotHeight + NA_LANE_OFFSET;
  const hasUnscored = points.some((point) => point.trajectoryScore === null);

  // Line segments through consecutive scored points; a request without a score breaks the line.
  let path = "";
  let penDown = false;
  points.forEach((point, index) => {
    if (point.trajectoryScore === null) {
      penDown = false;
      return;
    }
    path += `${penDown ? "L" : "M"}${xFor(index).toFixed(1)} ${yFor(point.trajectoryScore).toFixed(1)} `;
    penDown = true;
  });

  const peakText = peakScore === null ? "no trajectory score" : `peak ${peakScore} of 100`;
  const summary = `Line chart of trajectory score for session ${sessionId}, ${points.length} requests, ${peakText}. Values are listed in the table below.`;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs">
        <span className="text-muted-foreground">Session</span>
        <span className="font-mono" title={sessionId}>
          {sessionId.length > 18 ? `${shortId(sessionId)}…` : sessionId}
        </span>
        <span className="text-muted-foreground">agent</span>
        <span className="max-w-40 truncate font-mono">{agentId}</span>
        <span className="ml-auto flex items-center gap-1.5">
          <span className="text-muted-foreground">Peak</span>
          {peakScore === null ? (
            <span className="text-muted-foreground">n/a</span>
          ) : (
            <>
              <span className="font-mono tabular-nums">{peakScore}</span>
              <RiskTierBadge tier={riskTierForScore(peakScore)} />
            </>
          )}
        </span>
      </div>

      <div ref={ref} className="w-full">
        {width > 0 ? (
          <svg width={width} height={HEIGHT} role="img" aria-label={summary} className="block overflow-visible">
            {/* Axis hairlines at 0 and 100. */}
            {[0, 100].map((value) => (
              <g key={value}>
                <line x1={PAD.left} x2={PAD.left + plotWidth} y1={yFor(value)} y2={yFor(value)} className="stroke-border" strokeWidth={1} />
                <text x={PAD.left - 8} y={yFor(value)} dy="0.32em" textAnchor="end" className="fill-muted-foreground font-mono text-[10px]">
                  {value}
                </text>
              </g>
            ))}
            {/* HIGH threshold. */}
            <line
              x1={PAD.left}
              x2={PAD.left + plotWidth}
              y1={yFor(HIGH_RISK_THRESHOLD)}
              y2={yFor(HIGH_RISK_THRESHOLD)}
              className="stroke-risk-high"
              strokeWidth={1}
              strokeDasharray="4 4"
            />
            <text x={PAD.left - 8} y={yFor(HIGH_RISK_THRESHOLD)} dy="0.32em" textAnchor="end" className="fill-risk-high-text font-mono text-[10px]">
              {HIGH_RISK_THRESHOLD}
            </text>
            <text x={PAD.left + plotWidth} y={yFor(HIGH_RISK_THRESHOLD) - 6} textAnchor="end" className="fill-risk-high-text font-mono text-[10px] tracking-wider">
              HIGH
            </text>
            {hasUnscored ? (
              <text x={PAD.left - 8} y={naY} dy="0.32em" textAnchor="end" className="fill-muted-foreground font-mono text-[10px]">
                n/a
              </text>
            ) : null}

            <path d={path} fill="none" className="stroke-foreground/60" strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />

            {points.map((point, index) => {
              const { icon: Icon, tone, label } = DECISION_MARKS[point.decision];
              const x = xFor(index);
              const y = point.trajectoryScore === null ? naY : yFor(point.trajectoryScore);
              const highlighted = point.requestId === highlightRequestId;
              const title = `Request ${index + 1} of ${points.length}${highlighted ? " (this request)" : ""}, ${formatTimestamp(point.timestamp)}. ${label}: ${outcomePhrase(point.decision, point.gate)}. Trajectory ${point.trajectoryScore === null ? "not evaluated" : `${point.trajectoryScore} of 100`}.`;
              return (
                <g key={point.requestId}>
                  <title>{title}</title>
                  {highlighted ? (
                    <circle cx={x} cy={y} r={ICON / 2 + 5} fill="none" className="stroke-foreground" strokeWidth={1.5} />
                  ) : null}
                  <circle cx={x} cy={y} r={ICON / 2 + 2} className="fill-card" />
                  <Icon
                    x={x - ICON / 2}
                    y={y - ICON / 2}
                    width={ICON}
                    height={ICON}
                    aria-hidden="true"
                    className={cn(tone, point.trajectoryScore === null && "opacity-60")}
                  />
                </g>
              );
            })}
            <text x={PAD.left} y={HEIGHT - 4} className="fill-muted-foreground font-mono text-[10px] tracking-wider">
              REQUEST ORDER →
            </text>
          </svg>
        ) : (
          <div style={{ height: HEIGHT }} />
        )}
      </div>

      <DecisionLegend />

      <table className="sr-only">
        <caption>Trajectory score per request in session {sessionId}</caption>
        <thead>
          <tr>
            <th scope="col">Request</th>
            <th scope="col">Time</th>
            <th scope="col">Outcome</th>
            <th scope="col">Trajectory score</th>
          </tr>
        </thead>
        <tbody>
          {points.map((point, index) => (
            <tr key={point.requestId}>
              <td>
                {index + 1}
                {point.requestId === highlightRequestId ? " (this request)" : ""}
              </td>
              <td>{formatTimestamp(point.timestamp)}</td>
              <td>
                {DECISION_MARKS[point.decision].label}, {outcomePhrase(point.decision, point.gate)} ({GATE_LABELS[point.gate]})
              </td>
              <td>{point.trajectoryScore ?? "not evaluated"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TraceEmpty() {
  return (
    <div className="flex flex-1 flex-col items-start gap-2 rounded-lg border border-dashed border-border px-4 py-6">
      <MicroLabel>No trajectory yet</MicroLabel>
      <p className="max-w-sm text-sm text-muted-foreground">
        Trajectory analysis scores a request against its session&apos;s recent history. Once a session in the latest
        requests has a score, its path appears here.
      </p>
    </div>
  );
}
