"use client";

import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { toolsApi } from "@/lib/api/endpoints";
import { useAdminKey } from "@/lib/auth/admin-key";
import { describeToolError } from "@/lib/tools/model";
import { retryTransientFailures } from "@/lib/queries/audit";
import type { ToolCreateRequest, ToolResponse, ToolStatus } from "@/types/api";

export const toolKeys = {
  all: ["tools"] as const,
  list: () => [...toolKeys.all, "list"] as const,
};

/** Tools change what the gateway allows, so an agent's grants and the audit views may need a refresh too. */
function refreshTools(queryClient: QueryClient) {
  return queryClient.invalidateQueries({ queryKey: toolKeys.all });
}

export function useToolsList() {
  const { adminKey } = useAdminKey();

  return useQuery({
    queryKey: toolKeys.list(),
    queryFn: () => {
      if (adminKey === null) throw new Error("Admin key is not set.");
      return toolsApi.list({ adminKey });
    },
    enabled: adminKey !== null,
    retry: retryTransientFailures,
  });
}

export function useRegisterTool() {
  const { adminKey } = useAdminKey();
  const queryClient = useQueryClient();

  return useMutation({
    retry: false,
    mutationFn: (body: ToolCreateRequest) => {
      if (adminKey === null) throw new Error("Admin key is not set.");
      return toolsApi.register(body, { adminKey });
    },
    onSuccess: (tool) => {
      void refreshTools(queryClient);
      toast.success(`Tool ${tool.name} registered. It is active, and no agent can use it until granted.`);
    },
    onError: (error) => toast.error(describeToolError(error)),
  });
}

export function useUpdateToolStatus() {
  const { adminKey } = useAdminKey();
  const queryClient = useQueryClient();

  return useMutation({
    retry: false,
    mutationFn: ({ id, status }: { id: string; status: ToolStatus }) => {
      if (adminKey === null) throw new Error("Admin key is not set.");
      return toolsApi.updateStatus(id, status, { adminKey });
    },
    onSuccess: (tool: ToolResponse) => {
      void refreshTools(queryClient);
      toast.success(`${tool.name} is now ${tool.status === "ACTIVE" ? "active" : "disabled"}.`);
    },
    onError: (error) => toast.error(describeToolError(error)),
  });
}
