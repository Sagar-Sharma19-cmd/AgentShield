import { QueryClient, dehydrate } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/client";
import { dashboardKeys } from "./dashboard";
import { reviewKeys } from "./reviews";
import {
  agentKeyRotationMutationOptions,
  agentKeyRotationScope,
  agentKeys,
  agentStatusMutationOptions,
  type AgentKeyRotationResult,
  type IssuedAgentKey,
} from "./agents";
import type { AgentCreateResponse, AgentResponse, AgentStatus, PermissionResponse } from "@/types/api";

// Test-only values. Not credentials, and never used outside this file.
const AGENT_ID = "11111111-2222-4333-8444-555555555555";
const OTHER_ID = "99999999-2222-4333-8444-555555555555";
const FAKE_KEY = "agk_live_FAKEFAKEFAKEFAKEFAKEFAKEFAKEFAKE";
const OTHER_FAKE_KEY = "agk_live_OTHERFAKEOTHERFAKEOTHERFAKE";
const BACKEND_TEXT = "leaked-backend-text-should-not-show";
const ROTATED_PREFIX = "agk_live_fk12";

// Mutations only write the cache while an admin session is active (a key is stored). The browser always
// has one, so these tests set up the same precondition with an in-memory sessionStorage stub.
beforeEach(() => {
  const stored = new Map<string, string>([["agentshield_dev_admin_api_key", FAKE_KEY]]);
  Object.assign(globalThis, {
    window: {
      sessionStorage: {
        getItem: (k: string) => stored.get(k) ?? null,
        setItem: (k: string, v: string) => void stored.set(k, v),
        removeItem: (k: string) => void stored.delete(k),
      },
    },
  });
});

afterEach(() => {
  Reflect.deleteProperty(globalThis, "window");
});

function makeClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
}

function makeNotify() {
  return { success: vi.fn(), error: vi.fn() };
}

function makeAgent(id: string, status: AgentStatus = "SUSPENDED"): AgentResponse {
  return {
    id,
    name: "research-agent",
    description: "Reads source code",
    status,
    apiKeyPrefix: "agk_live_ab12",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-02T00:00:00Z",
  };
}

function makeRotation(id: string, apiKey: string): AgentCreateResponse {
  return {
    id,
    name: "research-agent",
    description: "Reads source code",
    status: "ACTIVE",
    apiKeyPrefix: ROTATED_PREFIX,
    apiKey,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-03T00:00:00Z",
  };
}

function makeGrant(agentId: string): PermissionResponse {
  return {
    id: "grant-1",
    agentId,
    agentName: "research-agent",
    toolId: "tool-1",
    toolName: "web-search",
    allowedActions: ["READ"],
    enabled: true,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  };
}

function makeApi() {
  return {
    updateStatus: vi.fn(),
    rotateKey: vi.fn(),
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** Lets pending promise continuations and React Query's scheduling run. */
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function statusOptions(queryClient: QueryClient, api: ReturnType<typeof makeApi>, adminKey: string | null = "test-admin") {
  return agentStatusMutationOptions({ adminKey, queryClient, notify: makeNotify(), api });
}

function rotationOptions(
  queryClient: QueryClient,
  api: ReturnType<typeof makeApi>,
  options: { agentId?: string; onKeyIssued?: (issued: IssuedAgentKey) => void; notify?: ReturnType<typeof makeNotify>; adminKey?: string | null } = {},
) {
  return agentKeyRotationMutationOptions({
    adminKey: options.adminKey === undefined ? "test-admin" : options.adminKey,
    queryClient,
    notify: options.notify ?? makeNotify(),
    api,
    agentId: options.agentId ?? AGENT_ID,
    onKeyIssued: options.onKeyIssued ?? vi.fn(),
  });
}

/** Seeds one entry per key family, so tests can see exactly which entries were invalidated. */
function seedCache(queryClient: QueryClient) {
  const keys = {
    registry: agentKeys.registry(),
    dashboardAgents: dashboardKeys.agents(),
    detail: agentKeys.detail(AGENT_ID),
    otherDetail: agentKeys.detail(OTHER_ID),
    grants: agentKeys.grants(AGENT_ID),
    reviewList: reviewKeys.list("PENDING"),
    decisionCounts: dashboardKeys.decisionCounts(),
  };
  queryClient.setQueryData(keys.registry, [makeAgent(AGENT_ID)]);
  queryClient.setQueryData(keys.dashboardAgents, [makeAgent(AGENT_ID)]);
  queryClient.setQueryData(keys.detail, makeAgent(AGENT_ID));
  queryClient.setQueryData(keys.otherDetail, makeAgent(OTHER_ID));
  queryClient.setQueryData(keys.grants, [makeGrant(AGENT_ID)]);
  queryClient.setQueryData(keys.reviewList, []);
  queryClient.setQueryData(keys.decisionCounts, { total: 0, byDecision: { ALLOW: 0, REVIEW: 0, DENY: 0 } });
  return keys;
}

describe("useUpdateAgentStatus factory: status change", () => {
  it("sends the status with admin auth and returns the updated agent", async () => {
    const queryClient = makeClient();
    const api = makeApi();
    const updated = makeAgent(AGENT_ID, "SUSPENDED");
    api.updateStatus.mockResolvedValue(updated);
    const notify = makeNotify();
    const options = agentStatusMutationOptions({ adminKey: "test-admin", queryClient, notify, api });
    const mutation = queryClient.getMutationCache().build(queryClient, options);

    const result = await mutation.execute({ id: AGENT_ID, status: "SUSPENDED" });

    expect(api.updateStatus).toHaveBeenCalledWith(AGENT_ID, "SUSPENDED", { adminKey: "test-admin" });
    expect(result).toEqual(updated);
    expect(notify.success).toHaveBeenCalledExactlyOnceWith("Agent is now Suspended.");
    expect(notify.error).not.toHaveBeenCalled();
  });

  it("notifies a safe message and never the backend text when the change fails", async () => {
    const queryClient = makeClient();
    const api = makeApi();
    api.updateStatus.mockRejectedValue(new ApiError(409, { message: BACKEND_TEXT } as never));
    const notify = makeNotify();
    const options = agentStatusMutationOptions({ adminKey: "test-admin", queryClient, notify, api });
    const mutation = queryClient.getMutationCache().build(queryClient, options);

    await expect(mutation.execute({ id: AGENT_ID, status: "ACTIVE" })).rejects.toThrow();

    expect(notify.error).toHaveBeenCalledExactlyOnceWith(expect.stringContaining("revoked"));
    expect(notify.error.mock.calls[0][0]).not.toContain(BACKEND_TEXT);
    expect(notify.success).not.toHaveBeenCalled();
  });

  it("makes no request when no admin key is set", async () => {
    const queryClient = makeClient();
    const api = makeApi();
    const notify = makeNotify();
    const options = agentStatusMutationOptions({ adminKey: null, queryClient, notify, api });
    const mutation = queryClient.getMutationCache().build(queryClient, options);

    await expect(mutation.execute({ id: AGENT_ID, status: "ACTIVE" })).rejects.toThrow("Admin key is not set.");
    expect(api.updateStatus).not.toHaveBeenCalled();
  });

  it("does not retry a failed request", async () => {
    const queryClient = makeClient();
    const api = makeApi();
    api.updateStatus.mockRejectedValue(new ApiError(500, null));
    const options = statusOptions(queryClient, api);
    const mutation = queryClient.getMutationCache().build(queryClient, options);

    await expect(mutation.execute({ id: AGENT_ID, status: "ACTIVE" })).rejects.toThrow();
    expect(api.updateStatus).toHaveBeenCalledTimes(1);
  });
});

describe("agentKeyRotationMutationOptions: rotation result and the one-time key", () => {
  it("returns only the sanitized fields, with no apiKey and no other response field", async () => {
    const queryClient = makeClient();
    const api = makeApi();
    api.rotateKey.mockResolvedValue(makeRotation(AGENT_ID, FAKE_KEY));
    const mutation = queryClient.getMutationCache().build(queryClient, rotationOptions(queryClient, api));

    const result = (await mutation.execute(undefined)) as AgentKeyRotationResult;

    expect(Object.keys(result).sort()).toEqual(["apiKeyPrefix", "id", "name", "status"]);
    expect(result).toEqual({ id: AGENT_ID, name: "research-agent", status: "ACTIVE", apiKeyPrefix: ROTATED_PREFIX });
  });

  it("delivers the plaintext key to the injected callback exactly once, with the agent id", async () => {
    const queryClient = makeClient();
    const api = makeApi();
    api.rotateKey.mockResolvedValue(makeRotation(AGENT_ID, FAKE_KEY));
    const onKeyIssued = vi.fn();
    const mutation = queryClient.getMutationCache().build(queryClient, rotationOptions(queryClient, api, { onKeyIssued }));

    await mutation.execute(undefined);

    expect(api.rotateKey).toHaveBeenCalledTimes(1);
    expect(api.rotateKey).toHaveBeenCalledWith(AGENT_ID, { adminKey: "test-admin" });
    expect(onKeyIssued).toHaveBeenCalledTimes(1);
    expect(onKeyIssued).toHaveBeenCalledWith({ agentId: AGENT_ID, apiKey: FAKE_KEY });
  });

  it("keeps the plaintext key out of the mutation state and out of a full cache dehydration", async () => {
    const queryClient = makeClient();
    const api = makeApi();
    api.rotateKey.mockResolvedValue(makeRotation(AGENT_ID, FAKE_KEY));
    const mutation = queryClient.getMutationCache().build(queryClient, rotationOptions(queryClient, api));

    await mutation.execute(undefined);

    // Checked before garbage collection, while the record is still held by the cache.
    expect(JSON.stringify(mutation.state)).not.toContain(FAKE_KEY);
    expect(mutation.state.data).not.toHaveProperty("apiKey");
    // Even if mutations were serialized (for example by a persistence or devtools hook), the key would not be in them.
    const dehydrated = dehydrate(queryClient, { shouldDehydrateMutation: () => true });
    expect(JSON.stringify(dehydrated)).not.toContain(FAKE_KEY);
    expect(JSON.stringify(queryClient.getQueryCache().getAll().map((query) => query.state))).not.toContain(FAKE_KEY);
  });

  it("does not put the key in the mutation variables or context", async () => {
    const queryClient = makeClient();
    const api = makeApi();
    api.rotateKey.mockResolvedValue(makeRotation(AGENT_ID, FAKE_KEY));
    const mutation = queryClient.getMutationCache().build(queryClient, rotationOptions(queryClient, api));

    await mutation.execute(undefined);

    expect(JSON.stringify(mutation.state.variables ?? null)).not.toContain(FAKE_KEY);
    expect(JSON.stringify(mutation.state.context ?? null)).not.toContain(FAKE_KEY);
  });

  it("never invokes the key callback on a backend failure, and never shows the key or the backend text", async () => {
    const queryClient = makeClient();
    const api = makeApi();
    api.rotateKey.mockRejectedValue(new ApiError(500, { message: `${BACKEND_TEXT} ${FAKE_KEY}` } as never));
    const onKeyIssued = vi.fn();
    const notify = makeNotify();
    const mutation = queryClient.getMutationCache().build(
      queryClient,
      rotationOptions(queryClient, api, { onKeyIssued, notify }),
    );

    await expect(mutation.execute(undefined)).rejects.toThrow();

    expect(onKeyIssued).not.toHaveBeenCalled();
    expect(notify.error).toHaveBeenCalledExactlyOnceWith(expect.stringContaining("could not complete"));
    const shown = notify.error.mock.calls[0][0];
    expect(shown).not.toContain(FAKE_KEY);
    expect(shown).not.toContain(BACKEND_TEXT);
    expect(notify.success).not.toHaveBeenCalled();
  });

  it("treats a response without a key as a failure, without calling the callback or echoing the response", async () => {
    const queryClient = makeClient();
    const api = makeApi();
    api.rotateKey.mockResolvedValue({ ...makeRotation(AGENT_ID, ""), apiKey: undefined } as never);
    const onKeyIssued = vi.fn();
    const notify = makeNotify();
    const mutation = queryClient.getMutationCache().build(
      queryClient,
      rotationOptions(queryClient, api, { onKeyIssued, notify }),
    );

    await expect(mutation.execute(undefined)).rejects.toThrow("Key rotation response was incomplete.");

    expect(onKeyIssued).not.toHaveBeenCalled();
    expect(notify.error).toHaveBeenCalledTimes(1);
  });

  it("makes no request and calls no callback when no admin key is set", async () => {
    const queryClient = makeClient();
    const api = makeApi();
    const onKeyIssued = vi.fn();
    const mutation = queryClient.getMutationCache().build(
      queryClient,
      rotationOptions(queryClient, api, { onKeyIssued, adminKey: null }),
    );

    await expect(mutation.execute(undefined)).rejects.toThrow("Admin key is not set.");

    expect(api.rotateKey).not.toHaveBeenCalled();
    expect(onKeyIssued).not.toHaveBeenCalled();
  });

  it("does not retry: a failed rotation is not silently repeated, which would issue a second key", async () => {
    const queryClient = makeClient();
    const api = makeApi();
    api.rotateKey.mockRejectedValue(new ApiError(500, null));
    const mutation = queryClient.getMutationCache().build(queryClient, rotationOptions(queryClient, api));

    await expect(mutation.execute(undefined)).rejects.toThrow();
    expect(api.rotateKey).toHaveBeenCalledTimes(1);
  });
});

describe("agentKeyRotationMutationOptions: scope and cache lifetime", () => {
  it("scopes rotations to the agent", () => {
    const queryClient = makeClient();
    const api = makeApi();

    const options = rotationOptions(queryClient, api, { agentId: AGENT_ID });
    expect(options.scope).toEqual({ id: agentKeyRotationScope(AGENT_ID) });
    expect(agentKeyRotationScope(AGENT_ID)).not.toBe(agentKeyRotationScope(OTHER_ID));
  });

  it("sets gcTime to 0 so the mutation record is dropped once nothing observes it", async () => {
    const queryClient = makeClient();
    const api = makeApi();
    api.rotateKey.mockResolvedValue(makeRotation(AGENT_ID, FAKE_KEY));
    const options = rotationOptions(queryClient, api);
    expect(options.gcTime).toBe(0);

    const mutation = queryClient.getMutationCache().build(queryClient, options);
    await mutation.execute(undefined);
    await flush();

    expect(queryClient.getMutationCache().getAll()).toHaveLength(0);
  });

  it("runs two rotations for the same agent one after another, not together", async () => {
    const queryClient = makeClient();
    const api = makeApi();
    const first = deferred<AgentCreateResponse>();
    const second = deferred<AgentCreateResponse>();
    api.rotateKey.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const options = rotationOptions(queryClient, api, { agentId: AGENT_ID });
    const cache = queryClient.getMutationCache();

    const firstRun = cache.build(queryClient, options).execute(undefined);
    const secondRun = cache.build(queryClient, options).execute(undefined);
    await flush();
    expect(api.rotateKey).toHaveBeenCalledTimes(1);

    first.resolve(makeRotation(AGENT_ID, FAKE_KEY));
    await firstRun;
    await flush();
    expect(api.rotateKey).toHaveBeenCalledTimes(2);

    second.resolve(makeRotation(AGENT_ID, OTHER_FAKE_KEY));
    await secondRun;
  });

  it("does not serialize rotations for different agents", async () => {
    const queryClient = makeClient();
    const api = makeApi();
    const first = deferred<AgentCreateResponse>();
    const second = deferred<AgentCreateResponse>();
    api.rotateKey.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const cache = queryClient.getMutationCache();

    const firstRun = cache.build(queryClient, rotationOptions(queryClient, api, { agentId: AGENT_ID })).execute(undefined);
    const secondRun = cache.build(queryClient, rotationOptions(queryClient, api, { agentId: OTHER_ID })).execute(undefined);
    await flush();

    expect(api.rotateKey).toHaveBeenCalledTimes(2);
    first.resolve(makeRotation(AGENT_ID, FAKE_KEY));
    second.resolve(makeRotation(OTHER_ID, OTHER_FAKE_KEY));
    await Promise.all([firstRun, secondRun]);
  });
});

describe("lifecycle mutations: cache invalidation", () => {
  it("after a status change, refreshes the registry, dashboard agents and detail, and writes the returned agent", async () => {
    const queryClient = makeClient();
    const keys = seedCache(queryClient);
    const api = makeApi();
    const updated = makeAgent(AGENT_ID, "SUSPENDED");
    api.updateStatus.mockResolvedValue(updated);
    const mutation = queryClient.getMutationCache().build(queryClient, statusOptions(queryClient, api));

    await mutation.execute({ id: AGENT_ID, status: "SUSPENDED" });

    expect(queryClient.getQueryState(keys.registry)?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(keys.dashboardAgents)?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(keys.detail)?.isInvalidated).toBe(true);
    expect(queryClient.getQueryData(keys.detail)).toEqual(updated);
  });

  it("after a status change, leaves grants, the review list and dashboard decision counts alone", async () => {
    const queryClient = makeClient();
    const keys = seedCache(queryClient);
    const api = makeApi();
    api.updateStatus.mockResolvedValue(makeAgent(AGENT_ID, "SUSPENDED"));
    const mutation = queryClient.getMutationCache().build(queryClient, statusOptions(queryClient, api));

    await mutation.execute({ id: AGENT_ID, status: "SUSPENDED" });

    expect(queryClient.getQueryState(keys.grants)?.isInvalidated).toBe(false);
    expect(queryClient.getQueryState(keys.reviewList)?.isInvalidated).toBe(false);
    expect(queryClient.getQueryState(keys.decisionCounts)?.isInvalidated).toBe(false);
  });

  it("after a rotation, refreshes the registry, dashboard agents and detail, and no grant, review or decision-count query", async () => {
    const queryClient = makeClient();
    const keys = seedCache(queryClient);
    const api = makeApi();
    api.rotateKey.mockResolvedValue(makeRotation(AGENT_ID, FAKE_KEY));
    const mutation = queryClient.getMutationCache().build(queryClient, rotationOptions(queryClient, api));

    await mutation.execute(undefined);

    expect(queryClient.getQueryState(keys.registry)?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(keys.dashboardAgents)?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(keys.detail)?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(keys.grants)?.isInvalidated).toBe(false);
    expect(queryClient.getQueryState(keys.reviewList)?.isInvalidated).toBe(false);
    expect(queryClient.getQueryState(keys.decisionCounts)?.isInvalidated).toBe(false);
  });

  it("does not rewrite another agent's cached detail after a rotation", async () => {
    const queryClient = makeClient();
    const keys = seedCache(queryClient);
    const api = makeApi();
    api.rotateKey.mockResolvedValue(makeRotation(AGENT_ID, FAKE_KEY));
    const before = queryClient.getQueryData(keys.otherDetail);
    const mutation = queryClient.getMutationCache().build(queryClient, rotationOptions(queryClient, api));

    await mutation.execute(undefined);

    // The shared detail prefix is refreshed, so the other agent's entry is marked stale, but its data is not rewritten.
    expect(queryClient.getQueryData(keys.otherDetail)).toBe(before);
  });

  it("after a failed status change or rotation, invalidates nothing", async () => {
    const queryClient = makeClient();
    const keys = seedCache(queryClient);
    const api = makeApi();
    api.updateStatus.mockRejectedValue(new ApiError(409, null));
    api.rotateKey.mockRejectedValue(new ApiError(409, null));
    const cache = queryClient.getMutationCache();

    await expect(cache.build(queryClient, statusOptions(queryClient, api)).execute({ id: AGENT_ID, status: "ACTIVE" })).rejects.toThrow();
    await expect(cache.build(queryClient, rotationOptions(queryClient, api)).execute(undefined)).rejects.toThrow();

    for (const key of [keys.registry, keys.dashboardAgents, keys.detail, keys.grants, keys.reviewList, keys.decisionCounts]) {
      expect(queryClient.getQueryState(key)?.isInvalidated).toBe(false);
    }
  });
});
