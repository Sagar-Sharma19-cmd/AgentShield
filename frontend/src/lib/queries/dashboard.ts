"use client";

import { useQuery } from "@tanstack/react-query";
import { agentsApi, auditApi } from "@/lib/api/endpoints";
import { useAdminKey } from "@/lib/auth/admin-key";
import { retryTransientFailures } from "@/lib/queries/audit";
import { DECISION_TYPES } from "@/lib/labels";
import type { AgentResponse, AuditLogPageResponse, DecisionType } from "@/types/api";

/** Backend AuditController caps `size` at 100 (MAX_PAGE_SIZE). */
export const DASHBOARD_SAMPLE_SIZE = 100;
export const DASHBOARD_INCIDENT_LIMIT = 5;
export const DASHBOARD_REFRESH_MS = 30_000;

/** Query keys carry no secrets. The admin key is read from context at fetch time. */
export const dashboardKeys = {
  all: ["dashboard"] as const,
  agents: () => [...dashboardKeys.all, "agents"] as const,
  decisionCounts: () => [...dashboardKeys.all, "decision-counts"] as const,
  recentEvents: () => [...dashboardKeys.all, "recent-events"] as const,
  incidents: () => [...dashboardKeys.all, "incidents"] as const,
};

export interface DecisionCounts {
  total: number;
  byDecision: Record<DecisionType, number>;
}

/**
 * Counts come from the audit page metadata (`totalElements`) with size 1, so no log rows are
 * downloaded. The total is the sum of the three decisions rather than a separate unfiltered read:
 * the requests are not one snapshot, and a separate total could disagree with the breakdown
 * when an evaluation lands between them.
 */
async function fetchDecisionCounts(adminKey: string): Promise<DecisionCounts> {
  const auth = { adminKey };
  const perDecision = await Promise.all(
    DECISION_TYPES.map((decision) => auditApi.search({ decision, page: 0, size: 1 }, auth)),
  );

  const byDecision = {} as Record<DecisionType, number>;
  DECISION_TYPES.forEach((decision, index) => {
    byDecision[decision] = perDecision[index].totalElements;
  });

  const total = DECISION_TYPES.reduce((sum, decision) => sum + byDecision[decision], 0);
  return { total, byDecision };
}

/**
 * Every dashboard query is gated on the admin key and stops polling after an error. A rejected
 * key therefore produces one failed request, not one every interval.
 */
function useAdminDashboardQuery<T>(queryKey: readonly unknown[], fetcher: (adminKey: string) => Promise<T>) {
  const { adminKey } = useAdminKey();

  return useQuery({
    queryKey,
    queryFn: () => {
      if (adminKey === null) throw new Error("Admin key is not set.");
      return fetcher(adminKey);
    },
    enabled: adminKey !== null,
    retry: retryTransientFailures,
    refetchInterval: (query) => (query.state.error ? false : DASHBOARD_REFRESH_MS),
  });
}

export function useAgentsForDashboard() {
  return useAdminDashboardQuery<AgentResponse[]>(dashboardKeys.agents(), (adminKey) =>
    agentsApi.list({ adminKey }),
  );
}

export function useDecisionCounts() {
  return useAdminDashboardQuery<DecisionCounts>(dashboardKeys.decisionCounts(), fetchDecisionCounts);
}

/** Newest evaluations. Feeds both the score distribution and the recent activity list. */
export function useRecentEvaluations() {
  return useAdminDashboardQuery<AuditLogPageResponse>(dashboardKeys.recentEvents(), (adminKey) =>
    auditApi.search({ page: 0, size: DASHBOARD_SAMPLE_SIZE }, { adminKey }),
  );
}

/** Newest DENY decisions (denied requests). */
export function useRecentIncidents() {
  return useAdminDashboardQuery<AuditLogPageResponse>(dashboardKeys.incidents(), (adminKey) =>
    auditApi.search({ decision: "DENY", page: 0, size: DASHBOARD_INCIDENT_LIMIT }, { adminKey }),
  );
}
