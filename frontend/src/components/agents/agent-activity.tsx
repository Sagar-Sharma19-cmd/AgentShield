"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { DecisionIcon, DECISION_MARKS } from "@/components/checkpoint/decision-mark";
import { GateIcon, GateMark } from "@/components/checkpoint/gate-mark";
import { SectionError } from "@/components/dashboard/section-states";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { buildActivityHref, parseActivityParams } from "@/lib/activity/filters";
import { gateBreakdown, recentActivity, sampleLabel } from "@/lib/agents/activity-sample";
import { GATE_LABELS } from "@/lib/checkpoint/gates";
import { formatTimestamp } from "@/lib/format";
import { ACTION_LABELS } from "@/lib/labels";
import { AGENT_SAMPLE_SIZE, useAgentAuditSample } from "@/lib/queries/audit";

const EYEBROW = "font-mono text-[0.6875rem] tracking-[0.08em] text-muted-foreground uppercase";

/**
 * Recent requests that named this agent, from the shared per-agent audit sample (the same query the Activity
 * detail uses). Audit rows record the agentId the request claimed, which is the agent's registered name, so
 * the sample is looked up by name. Counts cover the sample only and are labelled that way.
 */
export function AgentActivity({ agentName }: { agentName: string }) {
  const sample = useAgentAuditSample(agentName);
  const activityHref = buildActivityHref(parseActivityParams({ agentId: agentName }));

  return (
    <section aria-labelledby="agent-activity-heading" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 id="agent-activity-heading" className={EYEBROW}>
          Recent activity
        </h3>
        {sample.data && (
          <p className="font-mono text-xs tabular-nums text-muted-foreground">
            {sampleLabel(AGENT_SAMPLE_SIZE, sample.data.content.length)}
          </p>
        )}
      </div>

      {sample.isPending ? (
        <div aria-busy="true" aria-label="Loading recent activity" className="flex flex-col gap-2">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      ) : sample.isError ? (
        <SectionError error={sample.error} onRetry={() => void sample.refetch()} subject="recent activity" />
      ) : sample.data.content.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border px-4 py-5">
          <p className="text-sm font-medium">No requests recorded for {agentName}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Requests appear here once the agent calls the gateway with <span className="font-mono">agentId: {agentName}</span>.
          </p>
        </div>
      ) : (
        <>
          <GateBreakdown rows={sample.data.content} />
          <ul aria-label={`Latest requests from ${agentName}`} className="flex flex-col divide-y divide-border rounded-lg border border-border">
            {recentActivity(sample.data.content).map((item) => (
              <li key={item.requestId}>
                <Link
                  href={buildActivityHref(parseActivityParams({ agentId: agentName, request: item.requestId }))}
                  className="flex flex-col gap-1 px-3 py-2 transition-colors duration-150 motion-reduce:transition-none hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset sm:flex-row sm:items-center sm:gap-3"
                >
                  <span className="flex min-w-0 flex-1 items-center gap-2 text-sm">
                    <DecisionIcon decision={item.decision} />
                    <span className="sr-only">{DECISION_MARKS[item.decision].label}: </span>
                    <span className="shrink-0 font-medium">{ACTION_LABELS[item.action]}</span>
                    <span className="truncate font-mono text-xs text-muted-foreground" title={`${item.tool} · ${item.resource}`}>
                      {item.tool} · {item.resource}
                    </span>
                  </span>
                  <span className="flex items-center justify-between gap-3 text-xs text-muted-foreground sm:justify-end">
                    <GateMark gate={item.gate} />
                    <time dateTime={item.timestamp} className="font-mono tabular-nums">
                      {formatTimestamp(item.timestamp)}
                    </time>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}

      <div>
        <Button asChild variant="outline" size="sm">
          <Link href={activityHref}>
            Open in Activity
            <ArrowRight aria-hidden="true" />
          </Link>
        </Button>
      </div>
    </section>
  );
}

/** Where each sampled request was decided: one row per gate, label + count + a static bar. */
function GateBreakdown({ rows }: { rows: Parameters<typeof gateBreakdown>[0] }) {
  const breakdown = gateBreakdown(rows);
  return (
    <div className="flex flex-col gap-1.5 rounded-lg border border-border p-3">
      <p className="text-xs text-muted-foreground">Deciding gate, {sampleLabel(AGENT_SAMPLE_SIZE, rows.length).toLowerCase()}</p>
      <table className="w-full text-xs">
        <caption className="sr-only">Requests decided at each gate, {sampleLabel(AGENT_SAMPLE_SIZE, rows.length).toLowerCase()}</caption>
        <thead className="sr-only">
          <tr>
            <th scope="col">Gate</th>
            <th scope="col">Requests</th>
            <th scope="col">Share</th>
          </tr>
        </thead>
        <tbody>
          {breakdown.map(({ gate, count, share }) => (
            <tr key={gate} className={count === 0 ? "text-muted-foreground" : undefined}>
              <th scope="row" className="w-28 py-0.5 pr-2 text-left font-normal">
                <span className="inline-flex items-center gap-1.5">
                  <GateIcon gate={gate} className="text-muted-foreground" />
                  {GATE_LABELS[gate]}
                </span>
              </th>
              <td className="w-10 py-0.5 pr-2 text-right font-mono tabular-nums">{count}</td>
              <td className="py-0.5">
                <span className="sr-only">{Math.round(share * 100)}%</span>
                <span aria-hidden="true" className="block h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <span
                    className={gate === "PASSED" ? "block h-full origin-left bg-success" : "block h-full origin-left bg-foreground/40"}
                    style={{ transform: `scaleX(${share})` }}
                  />
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
