"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { agentsApi, permissionsApi } from "@/lib/api/endpoints";
import { useAdminKey } from "@/lib/auth/admin-key";
import { retryTransientFailures } from "@/lib/queries/audit";
import { dashboardKeys } from "@/lib/queries/dashboard";
import type { QueryClient } from "@tanstack/react-query";
import type { AgentResponse } from "@/types/api";

export const agentKeys = {
  all: ["agents"] as const,
  registry: () => [...agentKeys.all, "registry"] as const,
  /** Prefix for every single-agent detail key. Invalidating it does not touch grants or the registry. */
  details: () => [...agentKeys.all, "detail"] as const,
  detail: (agentId: string) => [...agentKeys.details(), agentId] as const,
  grants: (agentId: string) => [...agentKeys.all, "grants", agentId] as const,
};

/**
 * Refreshes the cached agent list (registry and dashboard copies) and any open agent detail. The
 * detail prefix covers only ["agents","detail",id]; grants are not invalidated.
 */
export function refreshAgentRegistry(queryClient: QueryClient) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: agentKeys.registry() }),
    queryClient.invalidateQueries({ queryKey: dashboardKeys.agents() }),
    queryClient.invalidateQueries({ queryKey: agentKeys.details() }),
  ]);
}

/**
 * One agent from GET /agents/{id}. The registry row is shown as placeholder data while this loads,
 * but the response replaces it, so the detail response is the authoritative copy. A 404 is not
 * retried: the agent is missing and retrying cannot change that.
 */
export function useAgent(agentId: string | undefined) {
  const { adminKey } = useAdminKey();
  const queryClient = useQueryClient();

  return useQuery({
    queryKey: agentKeys.detail(agentId ?? ""),
    queryFn: () => {
      if (adminKey === null || agentId === undefined) throw new Error("No agent selected.");
      return agentsApi.get(agentId, { adminKey });
    },
    enabled: adminKey !== null && agentId !== undefined,
    retry: retryTransientFailures,
    placeholderData: () =>
      agentId === undefined
        ? undefined
        : queryClient.getQueryData<AgentResponse[]>(agentKeys.registry())?.find((agent) => agent.id === agentId),
  });
}

/** Full agent registry, used to show agent names and lifecycle status next to a review. */
export function useAgentRegistry() {
  const { adminKey } = useAdminKey();

  return useQuery({
    queryKey: agentKeys.registry(),
    queryFn: () => {
      if (adminKey === null) throw new Error("Admin key is not set.");
      return agentsApi.list({ adminKey });
    },
    enabled: adminKey !== null,
    retry: retryTransientFailures,
  });
}

/** Current permission grants for one agent, so a reviewer can see what the agent is already allowed. */
export function useAgentGrants(agentId: string | undefined) {
  const { adminKey } = useAdminKey();

  return useQuery({
    queryKey: agentKeys.grants(agentId ?? ""),
    queryFn: () => {
      if (adminKey === null || agentId === undefined) throw new Error("No agent selected.");
      return permissionsApi.listForAgent(agentId, { adminKey });
    },
    enabled: adminKey !== null && agentId !== undefined,
    retry: retryTransientFailures,
  });
}
