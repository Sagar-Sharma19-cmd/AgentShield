"use client";

import { DecisionBadge } from "@/components/security/decision-badge";
import { toDecisionShares, toPercent } from "@/lib/dashboard/metrics";
import { useDecisionCounts } from "@/lib/queries/dashboard";
import { cn } from "@/lib/utils";
import type { DecisionType } from "@/types/api";
import { DashboardCard, SectionEmpty, SectionError, SectionSkeleton } from "./section-states";

/** Segment fills. Every segment is also named in the list below, so colour is never the only signal. */
const SEGMENT_FILL: Record<DecisionType, string> = {
  ALLOW: "bg-success",
  REVIEW: "bg-warning",
  DENY: "bg-danger",
};

export function DecisionBreakdownCard() {
  const query = useDecisionCounts();

  return (
    <DashboardCard
      title="Gateway decisions"
      description="ALLOW, REVIEW and DENY across every recorded evaluation."
    >
      {query.isPending ? (
        <SectionSkeleton label="Loading gateway decisions" rows={4} />
      ) : query.isError ? (
        <SectionError error={query.error} onRetry={() => void query.refetch()} subject="decision breakdown" />
      ) : query.data.total === 0 ? (
        <SectionEmpty
          title="No evaluations yet"
          body="Decisions appear here once an agent sends its first request through the gateway."
        />
      ) : (
        <DecisionBreakdown total={query.data.total} byDecision={query.data.byDecision} />
      )}
    </DashboardCard>
  );
}

function DecisionBreakdown({
  total,
  byDecision,
}: {
  total: number;
  byDecision: Record<DecisionType, number>;
}) {
  const shares = toDecisionShares(total, byDecision);

  return (
    <div className="flex flex-col gap-5">
      <div
        aria-hidden="true"
        className="flex h-3 w-full overflow-hidden rounded-full bg-muted motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-500"
      >
        {shares
          .filter((item) => item.count > 0)
          .map((item) => (
            <div
              key={item.decision}
              className={cn("h-full transition-[width] duration-500 motion-reduce:transition-none", SEGMENT_FILL[item.decision])}
              style={{ width: `${item.share * 100}%` }}
            />
          ))}
      </div>

      <ul className="flex flex-col gap-3">
        {shares.map((item) => (
          <li key={item.decision} className="flex items-center justify-between gap-3">
            <DecisionBadge decision={item.decision} />
            <span className="font-mono text-sm tabular-nums">
              <span className="font-medium">{item.count.toLocaleString()}</span>
              <span className="text-muted-foreground"> · {toPercent(item.share)}%</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
