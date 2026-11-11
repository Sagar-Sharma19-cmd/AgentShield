"use client";

import { useIsFetching, useQueryClient } from "@tanstack/react-query";
import { PageContainer, PageHeader } from "@/components/shell/page-header";
import { CircleAlert, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { SecurityAlertFeedCard } from "@/components/alerts/security-alert-feed-card";
import { CheckpointStream } from "@/components/checkpoint/checkpoint-stream";
import { GateFunnel } from "@/components/checkpoint/gate-funnel";
import { ReviewTriage } from "@/components/checkpoint/review-triage";
import { SessionTrace } from "@/components/checkpoint/session-trace";
import { formatTimestamp } from "@/lib/format";
import { dashboardKeys, DASHBOARD_REFRESH_MS, useRecentEvaluations } from "@/lib/queries/dashboard";
import { reviewKeys } from "@/lib/queries/reviews";
import { DecisionBreakdownCard } from "./decision-breakdown-card";

/**
 * "Checkpoint" Overview (docs/frontend-design-system.md, "Signature: Checkpoint"). It shows the
 * gateway pipeline itself: how far recent requests got (GateFunnel), where each one stopped
 * (CheckpointStream), what is waiting for a human (ReviewTriage) and the most escalated session
 * (SessionTrace). Every section reads an existing query and loads or fails on its own.
 *
 * The live alert feed stays here because the header's alert indicator links to it. The all-time
 * decision breakdown stays because it is the only all-time figure; every other panel is a sample.
 */
export function OverviewDashboard() {
  const queryClient = useQueryClient();
  const isRefreshing = useIsFetching({ queryKey: dashboardKeys.all }) > 0;

  function refresh() {
    void queryClient.invalidateQueries({ queryKey: dashboardKeys.all });
    void queryClient.invalidateQueries({ queryKey: reviewKeys.lists() });
  }

  return (
    <PageContainer>
      <PageHeader
        eyebrow="Monitor · Checkpoint"
        title="Overview"
        description="Where recent requests stopped in the gateway: identity, permission, policy, risk engine and trajectory checks."
        actions={
          <>
            <LiveIndicator />
            <Button variant="outline" size="sm" disabled={isRefreshing} onClick={refresh}>
              <RotateCw aria-hidden="true" className={cn(isRefreshing && "animate-spin motion-reduce:animate-none")} />
              Refresh
            </Button>
          </>
        }
      />

      <GateFunnel />
      <CheckpointStream />

      <div className="grid gap-5 lg:grid-cols-2">
        <ReviewTriage />
        <SessionTrace />
      </div>

      <div className="grid gap-5 lg:grid-cols-5">
        <div className="min-w-0 lg:col-span-3">
          <SecurityAlertFeedCard />
        </div>
        <div className="min-w-0 lg:col-span-2">
          <DecisionBreakdownCard />
        </div>
      </div>
    </PageContainer>
  );
}

/**
 * Freshness of the recent-evaluations sample, from the query's own state: refreshing, live (with the
 * last update time) or paused after an error (dashboard queries stop polling on error). Text and
 * icon carry the state; the dot colour only reinforces it.
 */
function LiveIndicator() {
  const query = useRecentEvaluations();
  const updated = query.dataUpdatedAt > 0 ? formatTimestamp(new Date(query.dataUpdatedAt).toISOString()) : null;

  if (query.isError) {
    return (
      <p role="status" className="flex items-center gap-1.5 rounded-md border border-warning/50 px-2 py-1 text-xs text-warning-text">
        <CircleAlert aria-hidden="true" className="size-3.5" />
        Paused: last refresh failed
      </p>
    );
  }

  // Not a live region: it flips every 30 s, and announcing that would be noise. The stream's status
  // line announces what actually changed.
  return (
    <p
      title={`Refreshes every ${DASHBOARD_REFRESH_MS / 1000} seconds`}
      className="flex items-center gap-2 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground"
    >
      <span aria-hidden="true" className={cn("size-1.5 rounded-full", query.isFetching ? "bg-muted-foreground" : "bg-success")} />
      <span className="font-mono tracking-wider text-foreground uppercase">{query.isFetching ? "Updating" : "Live"}</span>
      {updated ? (
        <span className="hidden font-mono tabular-nums sm:inline">
          <span className="sr-only">last updated </span>
          {updated.split(" ").at(-1)}
        </span>
      ) : null}
    </p>
  );
}
