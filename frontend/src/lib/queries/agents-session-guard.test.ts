import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { ApiError } from "@/lib/api/client";
import { changeAdminKey, lockAdminSession } from "@/lib/auth/admin-key";
import {
  agentKeyRotationMutationOptions,
  agentKeys,
  agentStatusMutationOptions,
  type MutationNotify,
} from "@/lib/queries/agents";
import type { AgentResponse } from "@/types/api";

// Regression tests for stale-session cache writes. Mutations are held open with deferred promises, so
// each test controls exactly when a request settles relative to a lock or key change. Each test waits on
// `started` before it locks, so the request has really been sent and the post-response guard is exercised.
// Keys are fake fixtures. The sessionStorage stub is in memory only.

const AGENT_ID = "11111111-1111-4111-8111-111111111111";
const KEY_ONE = "agk_admin_FAKEONE_0000000000000000";
const KEY_TWO = "agk_admin_FAKETWO_0000000000000000";

const store = new Map<string, string>();

beforeEach(() => {
  store.clear();
  store.set("agentshield_dev_admin_api_key", KEY_ONE);
  Object.assign(globalThis, {
    window: {
      sessionStorage: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => void store.set(k, v),
        removeItem: (k: string) => void store.delete(k),
      },
    },
  });
});

afterEach(() => {
  Reflect.deleteProperty(globalThis, "window");
  store.clear();
});

function newClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
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

function agent(status: AgentResponse["status"], name = "research-agent"): AgentResponse {
  return {
    id: AGENT_ID,
    name,
    description: null,
    status,
    apiKeyPrefix: "agk_live_ab12",
    createdAt: "2026-02-01T10:00:00Z",
    updatedAt: "2026-02-01T10:00:00Z",
  } as AgentResponse;
}

function spyNotify() {
  const successes: string[] = [];
  const errors: string[] = [];
  const notify: MutationNotify = {
    success: (message) => successes.push(message),
    error: (message) => errors.push(message),
  };
  return { notify, successes, errors };
}

/** Seeds an old-session view: a detail entry and a registry entry. */
function seedOldSession(queryClient: QueryClient) {
  queryClient.setQueryData(agentKeys.detail(AGENT_ID), agent("ACTIVE", "old-session-name"));
  queryClient.setQueryData(agentKeys.registry(), [agent("ACTIVE", "old-session-name")]);
}

/** Seeds a new-session registry entry, which an old mutation must not invalidate. */
function seedNewSessionRegistry(queryClient: QueryClient) {
  queryClient.setQueryData(agentKeys.registry(), [agent("ACTIVE", "new-session-name")]);
}

/**
 * Builds a status mutation whose request is held open. `started` resolves when the request is sent,
 * and `requests` records every request. The options are built here, so the session is captured now.
 */
function statusRun(
  queryClient: QueryClient,
  response: ReturnType<typeof deferred<AgentResponse>>,
  notify: MutationNotify,
  adminKey = KEY_ONE,
) {
  const started = deferred<void>();
  const requests: string[] = [];
  const options = agentStatusMutationOptions({
    adminKey,
    queryClient,
    notify,
    api: {
      updateStatus: (id: string) => {
        requests.push(id);
        started.resolve();
        return response.promise;
      },
    },
  });
  const mutation = queryClient.getMutationCache().build(queryClient, options);
  const run = mutation.execute({ id: AGENT_ID, status: "SUSPENDED" }).catch(() => undefined);
  return { run, started: started.promise, requests };
}

describe("status mutation: same session", () => {
  it("writes the detail and refreshes the registry when the session has not changed", async () => {
    const queryClient = newClient();
    seedOldSession(queryClient);
    const { notify, successes } = spyNotify();
    const response = deferred<AgentResponse>();
    const { run } = statusRun(queryClient, response, notify);

    response.resolve(agent("SUSPENDED"));
    await run;

    expect(queryClient.getQueryData<AgentResponse>(agentKeys.detail(AGENT_ID))?.status).toBe("SUSPENDED");
    expect(queryClient.getQueryState(agentKeys.registry())?.isInvalidated).toBe(true);
    expect(successes).toEqual(["Agent is now Suspended."]);
  });
});

describe("status mutation: stale options send nothing", () => {
  it("options built before a lock send no request, write nothing, and show no toast", async () => {
    const queryClient = newClient();
    seedOldSession(queryClient);
    const { notify, successes, errors } = spyNotify();
    const response = deferred<AgentResponse>();
    const { run, requests } = statusRun(queryClient, response, notify);
    // Settle the stub up front, so if a request were sent nothing would wait on it and the assertion below runs.
    response.resolve(agent("SUSPENDED"));

    // Lock before the mutation starts its request. onMutate captures the new generation here, so only the
    // build-time check can stop this request.
    lockAdminSession(queryClient);
    await run;

    // The lock clears the cache itself, so the detail is empty here. The stale result must not write it back.
    expect(requests).toEqual([]);
    expect(queryClient.getQueryData(agentKeys.detail(AGENT_ID))).toBeUndefined();
    expect(successes).toEqual([]);
    expect(errors).toEqual([]);
  });

  it("options built before a key change send no request", async () => {
    const queryClient = newClient();
    const { notify, successes, errors } = spyNotify();
    const response = deferred<AgentResponse>();
    const { run, requests } = statusRun(queryClient, response, notify);
    // Settle the stub up front, so if a request were sent nothing would wait on it and the assertion below runs.
    response.resolve(agent("SUSPENDED"));

    changeAdminKey(queryClient, KEY_TWO);
    await run;

    expect(requests).toEqual([]);
    expect(successes).toEqual([]);
    expect(errors).toEqual([]);
  });
});

describe("status mutation: lock or key change while pending", () => {
  it("lock while pending: the old result writes no detail and refreshes no registry", async () => {
    const queryClient = newClient();
    seedOldSession(queryClient);
    const { notify, successes } = spyNotify();
    const response = deferred<AgentResponse>();
    const { run, started } = statusRun(queryClient, response, notify);

    await started;
    lockAdminSession(queryClient);
    seedNewSessionRegistry(queryClient);
    response.resolve(agent("SUSPENDED"));
    await run;

    expect(queryClient.getQueryData(agentKeys.detail(AGENT_ID))).toBeUndefined();
    expect(queryClient.getQueryState(agentKeys.registry())?.isInvalidated).toBe(false);
    expect(successes).toEqual([]);
  });

  it("key change while pending: the old result cannot write or invalidate the new session's cache", async () => {
    const queryClient = newClient();
    seedOldSession(queryClient);
    const { notify, successes } = spyNotify();
    const response = deferred<AgentResponse>();
    const { run, started } = statusRun(queryClient, response, notify);

    await started;
    changeAdminKey(queryClient, KEY_TWO);
    seedNewSessionRegistry(queryClient);
    response.resolve(agent("SUSPENDED"));
    await run;

    expect(queryClient.getQueryData(agentKeys.detail(AGENT_ID))).toBeUndefined();
    expect(queryClient.getQueryState(agentKeys.registry())?.isInvalidated).toBe(false);
    expect(successes).toEqual([]);
  });

  it("lock then unlock with the same key while pending: the old result is still rejected", async () => {
    const queryClient = newClient();
    seedOldSession(queryClient);
    const { notify, successes } = spyNotify();
    const response = deferred<AgentResponse>();
    const { run, started } = statusRun(queryClient, response, notify);

    await started;
    lockAdminSession(queryClient);
    changeAdminKey(queryClient, KEY_ONE); // unlock again with the very same key
    seedNewSessionRegistry(queryClient);
    response.resolve(agent("SUSPENDED"));
    await run;

    expect(queryClient.getQueryData(agentKeys.detail(AGENT_ID))).toBeUndefined();
    expect(queryClient.getQueryState(agentKeys.registry())?.isInvalidated).toBe(false);
    expect(successes).toEqual([]);
  });

  it("a stale failure shows no toast", async () => {
    const queryClient = newClient();
    const { notify, errors } = spyNotify();
    const response = deferred<AgentResponse>();
    const { run, started } = statusRun(queryClient, response, notify);

    await started;
    lockAdminSession(queryClient);
    response.reject(new ApiError(500, null));
    await run;

    expect(errors).toEqual([]);
  });
});

describe("status mutation: no stored key", () => {
  it("writes nothing when the key is removed without a generation change (fails closed)", async () => {
    const queryClient = newClient();
    seedOldSession(queryClient);
    const { notify, successes } = spyNotify();
    const response = deferred<AgentResponse>();
    const { run, started } = statusRun(queryClient, response, notify);

    await started;
    store.delete("agentshield_dev_admin_api_key");
    response.resolve(agent("SUSPENDED"));
    await run;

    expect(queryClient.getQueryData<AgentResponse>(agentKeys.detail(AGENT_ID))?.name).toBe("old-session-name");
    expect(queryClient.getQueryState(agentKeys.registry())?.isInvalidated).toBe(false);
    expect(successes).toEqual([]);
  });
});

describe("status mutation: a new session works normally", () => {
  it("a mutation started after the unlock writes and refreshes as usual", async () => {
    const queryClient = newClient();
    const first = deferred<AgentResponse>();
    const stale = statusRun(queryClient, first, spyNotify().notify);
    await stale.started;
    lockAdminSession(queryClient);
    changeAdminKey(queryClient, KEY_TWO);
    first.resolve(agent("SUSPENDED"));
    await stale.run;

    seedNewSessionRegistry(queryClient);
    const { notify, successes } = spyNotify();
    const second = deferred<AgentResponse>();
    // Built after the key change, so it is current and sends its request with KEY_TWO.
    const current = statusRun(queryClient, second, notify, KEY_TWO);
    await current.started;
    second.resolve(agent("SUSPENDED", "new-session-name"));
    await current.run;

    expect(current.requests).toEqual([AGENT_ID]);
    expect(queryClient.getQueryData<AgentResponse>(agentKeys.detail(AGENT_ID))?.name).toBe("new-session-name");
    expect(queryClient.getQueryState(agentKeys.registry())?.isInvalidated).toBe(true);
    expect(successes).toEqual(["Agent is now Suspended."]);
  });
});

describe("status mutation: errors in the same session", () => {
  it("shows only the safe message, never the backend text, and writes nothing", async () => {
    const queryClient = newClient();
    seedOldSession(queryClient);
    const { notify, errors } = spyNotify();
    const response = deferred<AgentResponse>();
    const { run, started } = statusRun(queryClient, response, notify);

    await started;
    response.reject(
      new ApiError(500, { timestamp: "", status: 500, error: "", message: "SECRET-BACKEND-TEXT", fieldErrors: {} }),
    );
    await run;

    expect(errors).toEqual(["AgentShield could not complete the change. Try again in a moment."]);
    expect(errors.join(" ")).not.toContain("SECRET-BACKEND-TEXT");
    expect(queryClient.getQueryData<AgentResponse>(agentKeys.detail(AGENT_ID))?.name).toBe("old-session-name");
  });
});

describe("rotation mutation: stale session", () => {
  it("a rotation that settles after a lock does not invalidate the new session's registry or toast", async () => {
    const queryClient = newClient();
    const { notify, successes, errors } = spyNotify();
    const response = deferred<{ id: string; name: string; status: "ACTIVE"; apiKeyPrefix: string; apiKey: string }>();
    const started = deferred<void>();
    const options = agentKeyRotationMutationOptions({
      adminKey: KEY_ONE,
      queryClient,
      notify,
      api: {
        rotateKey: () => {
          started.resolve();
          return response.promise as never;
        },
      },
      agentId: AGENT_ID,
      onKeyIssued: () => undefined,
    });
    const run = queryClient.getMutationCache().build(queryClient, options).execute(undefined).catch(() => undefined);

    await started.promise;
    lockAdminSession(queryClient);
    seedNewSessionRegistry(queryClient);
    response.resolve({ id: AGENT_ID, name: "research-agent", status: "ACTIVE", apiKeyPrefix: "agk_live_new1", apiKey: "agk_live_FAKEROTATED00000000000000" });
    await run;

    expect(queryClient.getQueryState(agentKeys.registry())?.isInvalidated).toBe(false);
    expect(successes).toEqual([]);
    expect(errors).toEqual([]);
  });
});

// Rotation hand-off: onKeyIssued must run only for a session that is still current.
describe("rotation hand-off: session gate", () => {
  const ROTATED = {
    id: AGENT_ID,
    name: "research-agent",
    status: "ACTIVE" as const,
    apiKeyPrefix: "agk_live_new1",
    apiKey: "agk_live_FAKEROTATEDHANDOFF0000000000",
  };

  /** Builds a rotation whose request is held open, and records every hand-off and every request. */
  function rotationRun(queryClient: QueryClient) {
    const response = deferred<typeof ROTATED>();
    // Resolves once the request has actually been sent, so a test can lock while it is in flight.
    const started = deferred<void>();
    const handOffs: { agentId: string; apiKey: string }[] = [];
    const requests: string[] = [];
    const { notify, successes, errors } = spyNotify();
    const options = agentKeyRotationMutationOptions({
      adminKey: KEY_ONE,
      queryClient,
      notify,
      api: {
        rotateKey: (id: string) => {
          requests.push(id);
          started.resolve();
          return response.promise as never;
        },
      },
      agentId: AGENT_ID,
      onKeyIssued: (issued) => handOffs.push(issued),
    });
    const mutation = queryClient.getMutationCache().build(queryClient, options);
    const run = mutation.execute(undefined).catch(() => undefined);
    return { response, started: started.promise, handOffs, requests, successes, errors, mutation, run };
  }

  it("same session: the key is handed off exactly once, and the result carries no key", async () => {
    const queryClient = newClient();
    const { response, handOffs, mutation, run, successes } = rotationRun(queryClient);

    response.resolve(ROTATED);
    await run;

    expect(handOffs).toEqual([{ agentId: AGENT_ID, apiKey: ROTATED.apiKey }]);
    expect(mutation.state.status).toBe("success");
    expect(JSON.stringify(mutation.state)).not.toContain(ROTATED.apiKey);
    expect(JSON.stringify(mutation.state.context ?? null)).not.toContain(ROTATED.apiKey);
    expect(successes).toHaveLength(1);
  });

  it("lock during the request: the key is never handed off", async () => {
    const queryClient = newClient();
    const { response, started, handOffs, run, errors } = rotationRun(queryClient);

    await started;
    lockAdminSession(queryClient);
    response.resolve(ROTATED);
    await run;

    expect(handOffs).toEqual([]);
    expect(errors).toEqual([]);
  });

  it("key change during the request: the key is never handed off", async () => {
    const queryClient = newClient();
    const { response, started, handOffs, run } = rotationRun(queryClient);

    await started;
    changeAdminKey(queryClient, KEY_TWO);
    response.resolve(ROTATED);
    await run;

    expect(handOffs).toEqual([]);
  });

  it("lock then unlock with the same key during the request: the key is never handed off", async () => {
    const queryClient = newClient();
    const { response, started, handOffs, run } = rotationRun(queryClient);

    await started;
    lockAdminSession(queryClient);
    changeAdminKey(queryClient, KEY_ONE);
    response.resolve(ROTATED);
    await run;

    expect(handOffs).toEqual([]);
  });

  it("options built before a lock send no request and hand off nothing", async () => {
    const queryClient = newClient();
    const { handOffs, requests, run } = rotationRun(queryClient);

    lockAdminSession(queryClient);
    await run;

    expect(requests).toEqual([]);
    expect(handOffs).toEqual([]);
  });

  it("same session: invalidation and toast still run once the rotation succeeds", async () => {
    const queryClient = newClient();
    seedOldSession(queryClient);
    const { response, run, successes } = rotationRun(queryClient);

    response.resolve(ROTATED);
    await run;

    expect(queryClient.getQueryState(agentKeys.registry())?.isInvalidated).toBe(true);
    expect(successes).toEqual(["New key issued. The previous key no longer works."]);
  });

  it("stale rotation with a backend failure: no toast, and the key never leaves the session", async () => {
    const queryClient = newClient();
    const { response, started, handOffs, errors, run } = rotationRun(queryClient);

    await started;
    lockAdminSession(queryClient);
    response.reject(new ApiError(500, { timestamp: "", status: 500, error: "", message: "SECRET-BACKEND-TEXT", fieldErrors: {} }));
    await run;

    expect(handOffs).toEqual([]);
    expect(errors).toEqual([]);
  });
});
