"use client";

import { useIsFetching, useQueryClient } from "@tanstack/react-query";
import { RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { dashboardKeys } from "@/lib/queries/dashboard";
import { DecisionBreakdownCard } from "./decision-breakdown-card";
import { OverviewStats } from "./overview-stats";
import { RecentActivityCard, RecentIncidentsCard } from "./recent-events";
import { RiskDistributionCard } from "./risk-distribution-card";

/**
 * Security overview. Every number comes from an existing backend read (agents, audit totals,
 * audit list). Sections load and fail independently, so one failing request never blanks the page.
 */
export function OverviewDashboard() {
  const queryClient = useQueryClient();
  const isRefreshing = useIsFetching({ queryKey: dashboardKeys.all }) > 0;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-4 md:p-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">Overview</h1>
          <p className="text-sm text-muted-foreground">Gateway decisions, agent registration and recent security events.</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          disabled={isRefreshing}
          onClick={() => void queryClient.invalidateQueries({ queryKey: dashboardKeys.all })}
        >
          <RotateCw aria-hidden="true" className={cn(isRefreshing && "animate-spin motion-reduce:animate-none")} />
          Refresh
        </Button>
      </header>

      <OverviewStats />

      <div className="grid gap-4 lg:grid-cols-5">
        <div className="lg:col-span-2">
          <DecisionBreakdownCard />
        </div>
        <div className="lg:col-span-3">
          <RiskDistributionCard />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <RecentIncidentsCard />
        <RecentActivityCard />
      </div>
    </div>
  );
}
