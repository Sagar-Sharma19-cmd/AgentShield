"use client";

import { RotateCw, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { countAgents, toPercent } from "@/lib/dashboard/metrics";
import { useAgentsForDashboard, useDecisionCounts } from "@/lib/queries/dashboard";

interface StatTileProps {
  label: string;
  value: number | undefined;
  detail: string | undefined;
  isPending: boolean;
  isError: boolean;
  onRetry: () => void;
  index: number;
}

/** One KPI. Loading, failure and value each have their own rendering, so a failing tile never hides the others. */
function StatTile({ label, value, detail, isPending, isError, onRetry, index }: StatTileProps) {
  return (
    <Card
      size="sm"
      className="gap-2 p-4 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-1 motion-safe:duration-300"
      style={{ animationDelay: `${index * 60}ms`, animationFillMode: "both" }}
    >
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      {isPending ? (
        <div aria-busy="true" aria-label={`Loading ${label.toLowerCase()}`} className="flex flex-col gap-2">
          <Skeleton className="h-8 w-16" />
          <Skeleton className="h-3 w-28" />
        </div>
      ) : isError ? (
        <div className="flex flex-col items-start gap-2">
          <p className="flex items-center gap-1.5 text-xs text-danger-text">
            <TriangleAlert aria-hidden="true" className="size-3.5" />
            Unavailable
          </p>
          <Button variant="outline" size="xs" onClick={onRetry}>
            <RotateCw aria-hidden="true" />
            Retry
          </Button>
        </div>
      ) : (
        <>
          <p className="font-mono text-3xl font-semibold tabular-nums tracking-tight">{value ?? "–"}</p>
          <p className="text-xs text-muted-foreground">{detail}</p>
        </>
      )}
    </Card>
  );
}

/** Four headline numbers: agent registration, active agents, total evaluations and denials. */
export function OverviewStats() {
  const agents = useAgentsForDashboard();
  const decisions = useDecisionCounts();

  const counts = agents.data ? countAgents(agents.data) : undefined;
  const total = decisions.data?.total;
  const denied = decisions.data?.byDecision.DENY;
  const deniedShare = total && denied !== undefined ? toPercent(denied / total) : null;

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <StatTile
        index={0}
        label="Registered agents"
        value={counts?.registered}
        detail={counts ? `${counts.suspended} suspended · ${counts.revoked} revoked` : undefined}
        isPending={agents.isPending}
        isError={agents.isError}
        onRetry={() => void agents.refetch()}
      />
      <StatTile
        index={1}
        label="Active agents"
        value={counts?.active}
        detail={counts && counts.registered > 0 ? `${toPercent(counts.active / counts.registered)}% of registered` : "No agents yet"}
        isPending={agents.isPending}
        isError={agents.isError}
        onRetry={() => void agents.refetch()}
      />
      <StatTile
        index={2}
        label="Gateway evaluations"
        value={total}
        detail="Recorded in the audit log"
        isPending={decisions.isPending}
        isError={decisions.isError}
        onRetry={() => void decisions.refetch()}
      />
      <StatTile
        index={3}
        label="Denied requests"
        value={denied}
        detail={deniedShare === null ? undefined : `${deniedShare}% of evaluations`}
        isPending={decisions.isPending}
        isError={decisions.isError}
        onRetry={() => void decisions.refetch()}
      />
    </div>
  );
}

