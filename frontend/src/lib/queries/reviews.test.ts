import { QueryClient } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { reviewsApi } from "@/lib/api/endpoints";
import { ApiError } from "@/lib/api/client";
import { actionSuccessMessage } from "@/lib/reviews/model";
import type { ReviewRequestResponse, ReviewStatus } from "@/types/api";
import { agentKeys } from "./agents";
import { refreshReviewWorkspace, reviewActionMutationOptions, reviewKeys } from "./reviews";

const REVIEW_ID = "11111111-2222-4333-8444-555555555555";

function makeReview(status: ReviewStatus): ReviewRequestResponse {
  return {
    id: REVIEW_ID,
    requestId: "req-1",
    agentId: "agent-1",
    sessionId: "session-1",
    tool: "tool-1",
    action: "EXTERNAL_REQUEST",
    resource: "https://example.test",
    resourceSensitivity: "INTERNAL",
    riskScore: 60,
    riskTier: "MEDIUM",
    originalDecision: "REVIEW",
    status,
    reason: "Held for review.",
    trajectoryScore: null,
    trajectoryTier: null,
    trajectoryReason: null,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    reviewedAt: status === "IN_REVIEW" ? null : "2026-01-01T00:01:00Z",
    reviewer: status === "APPROVED" || status === "REJECTED" ? "alice" : null,
    note: null,
    expiresAt: "2026-01-01T00:30:00Z",
    expired: false,
    consumedAt: null,
    escalatedBy: "NONE",
  };
}

function makeClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
}

function makeNotify() {
  return { success: vi.fn(), error: vi.fn() };
}

describe("reviewActionMutationOptions: notifications", () => {
  it("notifies success exactly once through the hook-level callback, with the shared message", async () => {
    const queryClient = makeClient();
    const notify = makeNotify();
    const api = {
      start: vi.fn(),
      reject: vi.fn(),
      approve: vi.fn().mockResolvedValue(makeReview("APPROVED")),
    };
    const options = reviewActionMutationOptions({ adminKey: "test-key", queryClient, api, notify });
    const mutation = queryClient.getMutationCache().build(queryClient, options);

    await mutation.execute({ id: REVIEW_ID, action: "approve", from: "IN_REVIEW", decision: { reviewer: "alice" } });

    expect(api.approve).toHaveBeenCalledTimes(1);
    expect(notify.success).toHaveBeenCalledTimes(1);
    expect(notify.success).toHaveBeenCalledWith(actionSuccessMessage("approve", "IN_REVIEW", "APPROVED"));
    expect(notify.error).not.toHaveBeenCalled();
  });

  it("notifies one error with the backend message when the action fails", async () => {
    const queryClient = makeClient();
    const notify = makeNotify();
    const backendMessage = "Review is not in a state that allows approve.";
    const api = {
      start: vi.fn(),
      reject: vi.fn(),
      approve: vi.fn().mockRejectedValue(new ApiError(400, { message: backendMessage } as never)),
    };
    const options = reviewActionMutationOptions({ adminKey: "test-key", queryClient, api, notify });
    const mutation = queryClient.getMutationCache().build(queryClient, options);

    await expect(
      mutation.execute({ id: REVIEW_ID, action: "approve", from: "IN_REVIEW", decision: { reviewer: "alice" } }),
    ).rejects.toThrow();

    expect(notify.error).toHaveBeenCalledTimes(1);
    expect(notify.error.mock.calls[0][0]).toContain(backendMessage);
    expect(notify.success).not.toHaveBeenCalled();
  });

  it("fails without calling the API when no admin key is set", async () => {
    const queryClient = makeClient();
    const notify = makeNotify();
    const api = { start: vi.fn(), approve: vi.fn(), reject: vi.fn() };
    const options = reviewActionMutationOptions({ adminKey: null, queryClient, api, notify });
    const mutation = queryClient.getMutationCache().build(queryClient, options);

    await expect(mutation.execute({ id: REVIEW_ID, action: "start", from: "PENDING" })).rejects.toThrow(
      "Admin key is not set.",
    );
    expect(api.start).not.toHaveBeenCalled();
    expect(notify.error).toHaveBeenCalledTimes(1);
  });
});

describe("reviewActionMutationOptions: request body", () => {
  function setup() {
    const queryClient = makeClient();
    const api = {
      start: vi.fn().mockResolvedValue(makeReview("IN_REVIEW")),
      approve: vi.fn().mockResolvedValue(makeReview("APPROVED")),
      reject: vi.fn().mockResolvedValue(makeReview("REJECTED")),
    };
    const options = reviewActionMutationOptions({ adminKey: "test-key", queryClient, api, notify: makeNotify() });
    return { api, mutation: queryClient.getMutationCache().build(queryClient, options) };
  }

  it("sends {reviewer, note} with approve", async () => {
    const { api, mutation } = setup();
    await mutation.execute({
      id: REVIEW_ID,
      action: "approve",
      from: "IN_REVIEW",
      decision: { reviewer: "alice", note: "Staging only." },
    });
    expect(api.approve).toHaveBeenCalledWith(REVIEW_ID, { reviewer: "alice", note: "Staging only." }, { adminKey: "test-key" });
  });

  it("sends {reviewer, note} with reject", async () => {
    const { api, mutation } = setup();
    await mutation.execute({
      id: REVIEW_ID,
      action: "reject",
      from: "IN_REVIEW",
      decision: { reviewer: "bob", note: "Touches production." },
    });
    expect(api.reject).toHaveBeenCalledWith(REVIEW_ID, { reviewer: "bob", note: "Touches production." }, { adminKey: "test-key" });
  });

  it("start sends no decision body", async () => {
    const { api, mutation } = setup();
    await mutation.execute({ id: REVIEW_ID, action: "start", from: "PENDING", decision: { reviewer: "ignored" } });
    expect(api.start).toHaveBeenCalledWith(REVIEW_ID, { adminKey: "test-key" });
  });

  it("refuses a decision without a reviewer and never calls the API", async () => {
    const { api, mutation } = setup();
    await expect(mutation.execute({ id: REVIEW_ID, action: "approve", from: "IN_REVIEW" })).rejects.toThrow(
      "A reviewer name is required.",
    );
    await expect(
      mutation.execute({ id: REVIEW_ID, action: "reject", from: "IN_REVIEW", decision: { reviewer: "  ", note: "x" } }),
    ).rejects.toThrow("A reviewer name is required.");
    expect(api.approve).not.toHaveBeenCalled();
    expect(api.reject).not.toHaveBeenCalled();
  });
});

describe("reviewsApi: HTTP request", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("POSTs the decision as JSON to /approve and /reject with the admin key header", async () => {
    const fetchMock = vi.fn().mockImplementation(
      async () => new Response(JSON.stringify(makeReview("APPROVED")), { status: 200, headers: { "content-type": "application/json" } }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await reviewsApi.approve(REVIEW_ID, { reviewer: "alice" }, { adminKey: "test-key" });
    await reviewsApi.reject(REVIEW_ID, { reviewer: "bob", note: "No." }, { adminKey: "test-key" });

    const [approveUrl, approveInit] = fetchMock.mock.calls[0];
    expect(approveUrl).toBe(`/api/v1/reviews/${REVIEW_ID}/approve`);
    expect(approveInit.method).toBe("POST");
    expect(approveInit.headers).toMatchObject({ "Content-Type": "application/json", "X-Admin-API-Key": "test-key" });
    expect(JSON.parse(approveInit.body)).toEqual({ reviewer: "alice" });

    const [rejectUrl, rejectInit] = fetchMock.mock.calls[1];
    expect(rejectUrl).toBe(`/api/v1/reviews/${REVIEW_ID}/reject`);
    expect(JSON.parse(rejectInit.body)).toEqual({ reviewer: "bob", note: "No." });
  });
});

describe("reviewActionMutationOptions: stale detail reads", () => {
  it("keeps the authoritative APPROVED detail when an older IN_REVIEW read resolves after the decision", async () => {
    const queryClient = makeClient();
    const key = reviewKeys.detail(REVIEW_ID);
    queryClient.setQueryData(key, makeReview("IN_REVIEW"));

    // An in-flight detail poll that started before the decision. Its result is released by the test.
    let releaseStaleRead: (review: ReviewRequestResponse) => void = () => {};
    const staleRead = queryClient
      .fetchQuery({
        queryKey: key,
        queryFn: () => new Promise<ReviewRequestResponse>((resolve) => (releaseStaleRead = resolve)),
        staleTime: 0,
      })
      .catch(() => undefined); // Cancelled by the decision; the rejection is expected.

    const api = {
      start: vi.fn(),
      reject: vi.fn(),
      approve: vi.fn().mockResolvedValue(makeReview("APPROVED")),
    };
    const options = reviewActionMutationOptions({ adminKey: "test-key", queryClient, api, notify: makeNotify() });
    const mutation = queryClient.getMutationCache().build(queryClient, options);

    await mutation.execute({ id: REVIEW_ID, action: "approve", from: "IN_REVIEW", decision: { reviewer: "alice" } });
    expect(queryClient.getQueryData<ReviewRequestResponse>(key)?.status).toBe("APPROVED");

    // The stale poll now resolves with the pre-decision state. It must not overwrite the cache.
    releaseStaleRead(makeReview("IN_REVIEW"));
    await staleRead;
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(queryClient.getQueryData<ReviewRequestResponse>(key)?.status).toBe("APPROVED");
  });
});

describe("refreshReviewWorkspace", () => {
  it("invalidates the reviews prefix and the exact agent registry key, and nothing else", async () => {
    const queryClient = makeClient();
    const listKey = reviewKeys.list("PENDING");
    const detailKey = reviewKeys.detail(REVIEW_ID);
    const registryKey = agentKeys.registry();
    const grantsKey = agentKeys.grants("agent-1");
    for (const key of [listKey, detailKey, registryKey, grantsKey]) {
      queryClient.setQueryData(key, []);
    }

    await refreshReviewWorkspace(queryClient);

    expect(queryClient.getQueryState(listKey)?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(detailKey)?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(registryKey)?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(grantsKey)?.isInvalidated).toBe(false);
  });
});
