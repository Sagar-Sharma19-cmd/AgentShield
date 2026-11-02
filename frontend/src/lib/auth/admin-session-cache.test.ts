import { describe, expect, it } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { resetAdminSessionCache } from "./admin-key";

// These tests use a real QueryClient. They check what the cache holds afterwards, not how it is cleared.

const KEY = ["agents", "registry"] as const;

function newClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
}

/** A promise the test settles by hand, so an in-flight request can be held open across a reset. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("resetAdminSessionCache: query cache", () => {
  it("removes successful query entries, so the old session's data cannot be read back", async () => {
    const queryClient = newClient();
    await queryClient.fetchQuery({ queryKey: KEY, queryFn: async () => ["OLD-AGENT"] });
    expect(queryClient.getQueryData(KEY)).toEqual(["OLD-AGENT"]);

    resetAdminSessionCache(queryClient);

    expect(queryClient.getQueryData(KEY)).toBeUndefined();
    expect(queryClient.getQueryCache().getAll()).toHaveLength(0);
  });

  it("does not let a fetch started under the old session write into the cache afterwards", async () => {
    const queryClient = newClient();
    const response = deferred<string[]>();
    const inFlight = queryClient.fetchQuery({ queryKey: KEY, queryFn: () => response.promise }).catch(() => undefined);

    resetAdminSessionCache(queryClient);
    response.resolve(["OLD-AGENT"]);
    await inFlight;
    await flush();

    expect(queryClient.getQueryData(KEY)).toBeUndefined();
    expect(queryClient.getQueryCache().getAll()).toHaveLength(0);
  });

  it("lets the next session fetch fresh data, not the cleared value", async () => {
    const queryClient = newClient();
    await queryClient.fetchQuery({ queryKey: KEY, queryFn: async () => ["OLD-AGENT"] });

    resetAdminSessionCache(queryClient);

    let calls = 0;
    const fresh = await queryClient.fetchQuery({
      queryKey: KEY,
      queryFn: async () => {
        calls += 1;
        return ["NEW-AGENT"];
      },
    });
    expect(calls).toBe(1);
    expect(fresh).toEqual(["NEW-AGENT"]);
  });
});

describe("resetAdminSessionCache: mutation cache", () => {
  it("removes a successful mutation record", async () => {
    const queryClient = newClient();
    const mutation = queryClient.getMutationCache().build(queryClient, { mutationFn: async () => "done" });
    await mutation.execute(undefined);
    expect(queryClient.getMutationCache().getAll()).toHaveLength(1);

    resetAdminSessionCache(queryClient);

    expect(queryClient.getMutationCache().getAll()).toHaveLength(0);
  });

  it("removes a pending mutation record, and does not restore it when the request settles", async () => {
    const queryClient = newClient();
    const response = deferred<string>();
    const mutation = queryClient.getMutationCache().build(queryClient, { mutationFn: () => response.promise });
    const running = mutation.execute(undefined);
    expect(queryClient.getMutationCache().getAll()).toHaveLength(1);

    resetAdminSessionCache(queryClient);
    response.resolve("done");
    await running;
    await flush();

    expect(queryClient.getMutationCache().getAll()).toHaveLength(0);
  });

  it("clears queries and mutations together in one reset", async () => {
    const queryClient = newClient();
    await queryClient.fetchQuery({ queryKey: KEY, queryFn: async () => ["OLD-AGENT"] });
    await queryClient.getMutationCache().build(queryClient, { mutationFn: async () => "done" }).execute(undefined);

    resetAdminSessionCache(queryClient);

    expect(queryClient.getQueryCache().getAll()).toHaveLength(0);
    expect(queryClient.getMutationCache().getAll()).toHaveLength(0);
  });
});
