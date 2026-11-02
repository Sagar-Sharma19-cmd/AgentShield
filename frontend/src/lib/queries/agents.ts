"use client";

import { useMutation, useQuery, useQueryClient, type MutationOptions } from "@tanstack/react-query";
import { toast } from "sonner";
import { agentsApi, permissionsApi } from "@/lib/api/endpoints";
import { currentAdminSessionGeneration, isAdminSessionCurrent, useAdminKey } from "@/lib/auth/admin-key";
import { describeAgentActionError } from "@/lib/agents/detail-model";
import { AGENT_STATUS_LABELS } from "@/lib/labels";
import { retryTransientFailures } from "@/lib/queries/audit";
import { dashboardKeys } from "@/lib/queries/dashboard";
import type { QueryClient } from "@tanstack/react-query";
import type { AgentResponse, AgentStatus } from "@/types/api";

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

// ---------------------------------------------------------------------------
// Lifecycle mutations
// ---------------------------------------------------------------------------

/**
 * What the mutation cache may hold after a key rotation. It is built field by field, so no other
 * property of the response (including apiKey) can be copied into the cache by accident.
 */
export interface AgentKeyRotationResult {
  id: string;
  name: string;
  status: AgentStatus;
  apiKeyPrefix: string | null;
}

/** The plaintext key. It goes only to the UI-owned callback passed into the rotation mutation. */
export interface IssuedAgentKey {
  agentId: string;
  apiKey: string;
}

export interface MutationNotify {
  success: (message: string) => void;
  error: (message: string) => void;
}

export interface AgentStatusVariables {
  id: string;
  status: AgentStatus;
}

/** Every rotation for one agent shares this scope, so React Query runs them one after another. */
export function agentKeyRotationScope(agentId: string): string {
  return `agent-key:${agentId}`;
}

interface AgentMutationDeps {
  adminKey: string | null;
  queryClient: QueryClient;
  notify: MutationNotify;
}

/**
 * Captured in onMutate, when the mutation starts. Every later cache write, invalidation and toast in
 * the same mutation checks it first, so a result that settles after a lock or key change is dropped.
 */
export interface SessionContext {
  sessionGeneration: number;
}

/** True only for a mutation that started in the admin session that is still active. */
function startedInCurrentSession(queryClient: QueryClient, context: SessionContext | undefined): boolean {
  return context !== undefined && isAdminSessionCurrent(queryClient, context.sessionGeneration);
}

function captureSession(queryClient: QueryClient): SessionContext {
  return { sessionGeneration: currentAdminSessionGeneration(queryClient) };
}

/**
 * Status change for one agent. The response is the authoritative agent, so it replaces the cached
 * detail, and the registry copies are refreshed. Grants are not invalidated: they do not change here.
 * Duplicate submission is held off by the mutation's pending state, which the UI reads.
 *
 * Session guards, and why there are two generations:
 * - The build-time generation (`session`) is captured when the options are built, in the same render
 *   snapshot as `adminKey`. mutationFn checks it before any request, so stale options send nothing.
 *   onSuccess and onError also require it, so a pre-request failure shows no toast.
 * - onMutate captures the generation at mutation start. Its checks catch a change that lands during
 *   the request. Stale options used after a lock would capture the new generation there, so the
 *   build-time check is still required.
 * - onMutate cancels the detail query. It runs at mutation start, so it needs no guard.
 */
export function agentStatusMutationOptions({
  adminKey,
  queryClient,
  notify,
  api,
}: AgentMutationDeps & { api: Pick<typeof agentsApi, "updateStatus"> }): MutationOptions<
  AgentResponse,
  Error,
  AgentStatusVariables,
  SessionContext
> {
  const session: SessionContext = captureSession(queryClient);
  const buildSessionCurrent = () => isAdminSessionCurrent(queryClient, session.sessionGeneration);

  return {
    retry: false,
    mutationFn: ({ id, status }) => {
      if (adminKey === null) throw new Error("Admin key is not set.");
      // Stale options send no request at all.
      if (!buildSessionCurrent()) throw new Error(SESSION_CHANGED_BEFORE_STATUS);
      return api.updateStatus(id, status, { adminKey });
    },
    onMutate: async ({ id }) => {
      const context = captureSession(queryClient);
      // An in-flight detail read started before this change must not write the old status back.
      await queryClient.cancelQueries({ queryKey: agentKeys.detail(id) });
      return context;
    },
    onSuccess: async (agent, _variables, context) => {
      if (!buildSessionCurrent() || !startedInCurrentSession(queryClient, context)) return;
      await queryClient.cancelQueries({ queryKey: agentKeys.detail(agent.id) });
      if (!buildSessionCurrent() || !startedInCurrentSession(queryClient, context)) return;
      queryClient.setQueryData(agentKeys.detail(agent.id), agent);
      void refreshAgentRegistry(queryClient);
      notify.success(`Agent is now ${AGENT_STATUS_LABELS[agent.status]}.`);
    },
    onError: (error, _variables, context) => {
      if (!buildSessionCurrent() || !startedInCurrentSession(queryClient, context)) return;
      notify.error(describeAgentActionError(error));
    },
  };
}

/** Fixed text for a status change stopped before its request. It carries no request content. */
const SESSION_CHANGED_BEFORE_STATUS = "The admin session changed. The status change was not sent.";

/**
 * Key rotation for one agent. The plaintext key is read from the response here, passed once to
 * onKeyIssued, and left out of the value the mutation returns. The mutation result, its variables and
 * the query cache therefore never hold it.
 *
 * - retry is off: a retried rotation would silently issue a second key and invalidate the first.
 * - gcTime is 0: the mutation record is dropped as soon as no component observes it.
 * - scope is per agent: rotations for the same agent are serialized.
 * - onKeyIssued is not called on any failure path.
 */
export function agentKeyRotationMutationOptions({
  adminKey,
  queryClient,
  notify,
  api,
  agentId,
  onKeyIssued,
}: AgentMutationDeps & {
  api: Pick<typeof agentsApi, "rotateKey">;
  agentId: string;
  onKeyIssued: (issued: IssuedAgentKey) => void;
}): MutationOptions<AgentKeyRotationResult, Error, void, SessionContext> {
  // Captured here, in the same render snapshot as `adminKey`, so the generation is bound to the key
  // the request uses. mutationFn cannot read onMutate's context, so this is the only point where both
  // values are known together. Every check below compares against this generation.
  const session: SessionContext = captureSession(queryClient);

  return {
    scope: { id: agentKeyRotationScope(agentId) },
    gcTime: 0,
    retry: false,
    mutationFn: async () => {
      if (adminKey === null) throw new Error("Admin key is not set.");
      // Stale options (built before a lock or key change) send no request at all.
      if (!isAdminSessionCurrent(queryClient, session.sessionGeneration)) throw new Error(SESSION_CHANGED);
      const response = await api.rotateKey(agentId, { adminKey });
      if (typeof response?.apiKey !== "string" || response.apiKey === "") {
        // Fails without echoing the response, so the message carries no part of it.
        throw new Error("Key rotation response was incomplete.");
      }
      // Hand-off gate. The server has already rotated, so a key that arrives after the session changed
      // is not delivered to the UI. It is dropped with the stale session, and the operator must rotate
      // again. The thrown message is fixed text, so no key or response content can reach it.
      if (!isAdminSessionCurrent(queryClient, session.sessionGeneration)) throw new Error(SESSION_CHANGED);
      onKeyIssued({ agentId, apiKey: response.apiKey });
      return {
        id: response.id,
        name: response.name,
        status: response.status,
        apiKeyPrefix: response.apiKeyPrefix,
      };
    },
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: agentKeys.detail(agentId) });
      return session;
    },
    onSuccess: (_result, _variables, context) => {
      // Stale-session guard: a rotation that settles after a lock or key change must not invalidate the
      // new session's cache or toast. Its key is handled by the lifecycle section, which has unmounted.
      if (!startedInCurrentSession(queryClient, context)) return;
      // The response has only part of the agent, so the detail is refetched rather than written.
      void refreshAgentRegistry(queryClient);
      notify.success("New key issued. The previous key no longer works.");
    },
    onError: (error, _variables, context) => {
      if (!startedInCurrentSession(queryClient, context)) return;
      notify.error(describeAgentActionError(error));
    },
  };
}

/** Fixed text for a rotation stopped by a session change. It carries no request or response content. */
const SESSION_CHANGED = "The admin session changed during key rotation.";

const toastNotify: MutationNotify = {
  success: (message) => toast.success(message),
  error: (message) => toast.error(message),
};

/** Status change hook. Notifications are hook-level, so they still fire if the caller has unmounted. */
export function useUpdateAgentStatus() {
  const { adminKey } = useAdminKey();
  const queryClient = useQueryClient();

  return useMutation(
    agentStatusMutationOptions({ adminKey, queryClient, notify: toastNotify, api: agentsApi }),
  );
}

/**
 * Key rotation for one agent. The caller owns onKeyIssued and is responsible for holding the key
 * only as long as it is displayed (see the one-time key design in the M3.3 plan).
 */
export function useRotateAgentKey(agentId: string, onKeyIssued: (issued: IssuedAgentKey) => void) {
  const { adminKey } = useAdminKey();
  const queryClient = useQueryClient();

  return useMutation(
    agentKeyRotationMutationOptions({
      adminKey,
      queryClient,
      notify: toastNotify,
      api: agentsApi,
      agentId,
      onKeyIssued,
    }),
  );
}
