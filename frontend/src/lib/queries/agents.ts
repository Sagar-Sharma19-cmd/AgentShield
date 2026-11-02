"use client";

import { useQuery } from "@tanstack/react-query";
import { agentsApi, permissionsApi } from "@/lib/api/endpoints";
import { useAdminKey } from "@/lib/auth/admin-key";
import { retryTransientFailures } from "@/lib/queries/audit";

export const agentKeys = {
  all: ["agents"] as const,
  registry: () => [...agentKeys.all, "registry"] as const,
  grants: (agentId: string) => [...agentKeys.all, "grants", agentId] as const,
};

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
