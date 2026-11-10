"use client";

import { motion } from "motion/react";
import { AnimatedNumber } from "@/components/motion/animated-number";
import { SectionEmpty, SectionError } from "@/components/dashboard/section-states";
import { Skeleton } from "@/components/ui/skeleton";
import { funnel, FUNNEL_STAGES } from "@/lib/checkpoint/gates";
import { toPercent } from "@/lib/dashboard/metrics";
import { durations, easings } from "@/lib/motion/tokens";
import { useRecentEvaluations } from "@/lib/queries/dashboard";
import { cn } from "@/lib/utils";
import { CheckpointPanel, MicroLabel } from "./checkpoint-panel";

const FOOTNOTE =
  "Requests rejected with HTTP 401 (a bad or missing agent key) never reach the gateway, so they are not counted here.";

/**
 * How many of the latest audited requests got past each gate. Counts come from the recent-evaluations
 * sample only (the newest audit rows), so the panel says "Last N requests", never an all-time figure.
 */
export function GateFunnel() {
  const query = useRecentEvaluations();
  const rows = query.data?.content;

  return (
    <CheckpointPanel
      eyebrow="Gate funnel"
      title={rows ? `Last ${rows.length} ${rows.length === 1 ? "request" : "requests"}` : "Latest requests"}
      description="How many requests made it past each checkpoint, in pipeline order."
    >
      {query.isPending ? (
        <FunnelSkeleton />
      ) : query.isError && !rows ? (
        <SectionError error={query.error} onRetry={() => void query.refetch()} subject="the gate funnel" />
      ) : !rows || rows.length === 0 ? (
        <SectionEmpty
          title="The gateway is waiting for its first request"
          body="Each stage fills in as agents send requests through the gateway."
        />
      ) : (
        <FunnelStages rows={rows} />
      )}
      <p className="text-xs text-muted-foreground">{FOOTNOTE}</p>
    </CheckpointPanel>
  );
}

function FunnelStages({ rows }: { rows: Parameters<typeof funnel>[0] }) {
  const stages = funnel(rows);

  return (
    <ol className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-3 lg:grid-cols-5">
      {stages.map((stage, index) => (
        <li key={stage.id} className={cn("flex flex-col gap-2 bg-card p-3", index === 0 && "col-span-2 sm:col-span-1")}>
          <div className="flex items-baseline justify-between gap-2">
            <MicroLabel>{stage.label}</MicroLabel>
            <span className="font-mono text-[0.6875rem] tabular-nums text-muted-foreground">{index + 1}/5</span>
          </div>
          <AnimatedNumber value={stage.count} className="font-mono text-2xl font-semibold tracking-tight" />
          <p className="text-xs text-muted-foreground">
            <span className="font-mono tabular-nums">{toPercent(stage.share)}%</span> of requests
          </p>
          <div aria-hidden="true" className="h-1 w-full overflow-hidden rounded-full bg-muted">
            {/* scaleX, not width: transform-only animation. Reduced motion shows the final length. */}
            <motion.div
              className={cn("h-full origin-left rounded-full", stage.id === "ALLOWED" ? "bg-success" : "bg-foreground/55")}
              initial={{ scaleX: 0 }}
              animate={{ scaleX: stage.share }}
              transition={{ duration: durations.slow, ease: easings.enter, delay: index * 0.04 }}
            />
          </div>
        </li>
      ))}
    </ol>
  );
}

function FunnelSkeleton() {
  return (
    <div
      aria-busy="true"
      aria-label="Loading the gate funnel"
      className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-3 lg:grid-cols-5"
    >
      {FUNNEL_STAGES.map((id, index) => (
        <div key={id} className={cn("flex flex-col gap-2 bg-card p-3", index === 0 && "col-span-2 sm:col-span-1")}>
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-7 w-12" />
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-1 w-full" />
        </div>
      ))}
    </div>
  );
}
