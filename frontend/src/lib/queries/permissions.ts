"use client";

import { useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { permissionsApi } from "@/lib/api/endpoints";
import { useAdminKey } from "@/lib/auth/admin-key";
import { agentKeys } from "@/lib/queries/agents";
import { describeGrantError, describeRevokeError } from "@/lib/agents/permission-grant";
import type { PermissionCreateRequest } from "@/types/api";

/** Only the agent's grants are stale after a grant or revoke. The registry and agent detail are unaffected. */
function refreshGrants(queryClient: QueryClient, agentId: string) {
  return queryClient.invalidateQueries({ queryKey: agentKeys.grants(agentId) });
}

export function useGrantPermission(agentId: string) {
  const { adminKey } = useAdminKey();
  const queryClient = useQueryClient();

  return useMutation({
    retry: false,
    mutationFn: (body: Omit<PermissionCreateRequest, "agentId">) => {
      if (adminKey === null) throw new Error("Admin key is not set.");
      return permissionsApi.grant({ ...body, agentId }, { adminKey });
    },
    onSuccess: (grant) => {
      void refreshGrants(queryClient, agentId);
      toast.success(`Granted ${grant.toolName} to ${grant.agentName}.`);
    },
    onError: (error) => toast.error(describeGrantError(error)),
  });
}

export function useRevokePermission(agentId: string) {
  const { adminKey } = useAdminKey();
  const queryClient = useQueryClient();

  return useMutation({
    retry: false,
    mutationFn: (grantId: string) => {
      if (adminKey === null) throw new Error("Admin key is not set.");
      return permissionsApi.revoke(grantId, { adminKey });
    },
    onSuccess: () => {
      void refreshGrants(queryClient, agentId);
      toast.success("Grant revoked. The agent can no longer use that tool.");
    },
    onError: (error) => {
      // A 404 means the grant is already gone, so the refreshed list is the correct outcome.
      void refreshGrants(queryClient, agentId);
      toast.error(describeRevokeError(error));
    },
  });
}
