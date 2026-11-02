"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { agentsApi } from "@/lib/api/endpoints";
import { currentAdminSessionGeneration, isAdminSessionCurrent, useAdminKey } from "@/lib/auth/admin-key";
import { describeRegistrationError } from "@/lib/agents/registration";
import { refreshAgentRegistry } from "@/lib/queries/agents";
import type { AgentCreateRequest, AgentResponse } from "@/types/api";

export interface IssuedRegistrationKey {
  agentName: string;
  apiKey: string;
}

/**
 * Registers an agent. The plaintext key is handed to onKeyIssued only, never returned from the mutation,
 * so it cannot be read back from the mutation cache. The returned row omits the key.
 */
export function useRegisterAgent(onKeyIssued: (issued: IssuedRegistrationKey) => void) {
  const { adminKey } = useAdminKey();
  const queryClient = useQueryClient();

  return useMutation({
    retry: false,
    gcTime: 0,
    mutationFn: async (body: AgentCreateRequest): Promise<AgentResponse> => {
      if (adminKey === null) throw new Error("Admin key is not set.");
      const generation = currentAdminSessionGeneration(queryClient);
      const created = await agentsApi.register(body, { adminKey });
      // A key issued after a lock or key change is dropped, since the operator can no longer see it.
      if (!isAdminSessionCurrent(queryClient, generation)) throw new Error("The admin session changed.");
      onKeyIssued({ agentName: created.name, apiKey: created.apiKey });
      return {
        id: created.id,
        name: created.name,
        description: created.description,
        status: created.status,
        apiKeyPrefix: created.apiKeyPrefix,
        createdAt: created.createdAt,
        updatedAt: created.updatedAt,
      };
    },
    onSuccess: () => {
      void refreshAgentRegistry(queryClient);
      toast.success("Agent registered. Save its API key now; it is shown only once.");
    },
    onError: (error) => {
      if (error instanceof Error && error.message === "The admin session changed.") return;
      toast.error(describeRegistrationError(error));
    },
  });
}
