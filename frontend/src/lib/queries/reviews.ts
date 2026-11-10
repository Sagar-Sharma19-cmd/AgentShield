"use client";

import { useMutation, useQueries, useQuery, useQueryClient, type MutationOptions, type QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { reviewsApi } from "@/lib/api/endpoints";
import { useAdminKey } from "@/lib/auth/admin-key";
import { agentKeys } from "@/lib/queries/agents";
import { retryTransientFailures } from "@/lib/queries/audit";
import {
  REVIEW_STATUSES,
  actionSuccessMessage,
  describeActionError,
  type ReviewAction,
} from "@/lib/reviews/model";
import type { ReviewDecisionBody, ReviewRequestResponse, ReviewStatus } from "@/types/api";

/** Review state changes from other operators, so the queue and an open review are refreshed on an interval. */
export const REVIEW_REFRESH_MS = 30_000;

/** Query keys carry no secrets. The admin key is read from context at fetch time. */
export const reviewKeys = {
  all: ["reviews"] as const,
  lists: () => [...reviewKeys.all, "list"] as const,
  list: (status: ReviewStatus) => [...reviewKeys.lists(), status] as const,
  detail: (id: string) => [...reviewKeys.all, "detail", id] as const,
};

function listQueryOptions(status: ReviewStatus, adminKey: string | null) {
  return {
    queryKey: reviewKeys.list(status),
    queryFn: () => {
      if (adminKey === null) throw new Error("Admin key is not set.");
      return reviewsApi.listByStatus(status, { adminKey });
    },
    enabled: adminKey !== null,
    retry: retryTransientFailures,
    refetchInterval: REVIEW_REFRESH_MS,
  };
}

/** Reviews in one status. Results are unordered on the backend; callers sort them. */
export function useReviewsByStatus(status: ReviewStatus) {
  const { adminKey } = useAdminKey();
  return useQuery(listQueryOptions(status, adminKey));
}

/**
 * Counts for every status tab. Uses the same query keys as useReviewsByStatus, so the active tab
 * shares its cache entry with the queue and the counts add no extra requests for that tab.
 */
export function useReviewCounts() {
  const { adminKey } = useAdminKey();
  const results = useQueries({
    queries: REVIEW_STATUSES.map((status) => listQueryOptions(status, adminKey)),
  });

  const counts = Object.fromEntries(
    REVIEW_STATUSES.map((status, index) => [status, results[index].data?.length]),
  ) as Record<ReviewStatus, number | undefined>;

  return {
    counts,
    isError: results.some((result) => result.isError),
  };
}

/**
 * Manual refresh for the Reviews page. Invalidates the review queries and the agent registry, which
 * the page uses for agent names. Grants are not invalidated: they are not shown on the page list.
 */
export function refreshReviewWorkspace(queryClient: QueryClient) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: reviewKeys.all }),
    queryClient.invalidateQueries({ queryKey: agentKeys.registry() }),
  ]);
}

export function useReview(id: string | undefined) {
  const { adminKey } = useAdminKey();

  return useQuery({
    queryKey: reviewKeys.detail(id ?? ""),
    queryFn: () => {
      if (adminKey === null || id === undefined) throw new Error("No review selected.");
      return reviewsApi.get(id, { adminKey });
    },
    enabled: adminKey !== null && id !== undefined,
    retry: retryTransientFailures,
    refetchInterval: REVIEW_REFRESH_MS,
  });
}

export interface ReviewActionVariables {
  id: string;
  action: ReviewAction;
  /** Status the operator saw when they acted. Used only for the success message. */
  from: ReviewStatus;
  /** Required for approve and reject: {reviewer, note}. Ignored for start. */
  decision?: ReviewDecisionBody;
}

export interface ReviewActionDeps {
  adminKey: string | null;
  queryClient: QueryClient;
  api: Pick<typeof reviewsApi, ReviewAction>;
  notify: { success: (message: string) => void; error: (message: string) => void };
}

/**
 * Mutation lifecycle for start, approve and reject. Kept free of React so it can be tested directly.
 *
 * - Notifications are hook-level, so they still fire if the component that started the action has
 *   unmounted (per-call callbacks are dropped in that case).
 * - In-flight detail reads are cancelled before a successful response is written to the cache.
 *   Otherwise an older poll that resolves later could restore the previous status.
 * - The server response is then the authoritative detail, and lists are refreshed.
 */
export function reviewActionMutationOptions({
  adminKey,
  queryClient,
  api,
  notify,
}: ReviewActionDeps): MutationOptions<ReviewRequestResponse, Error, ReviewActionVariables> {
  return {
    mutationFn: ({ id, action, decision }) => {
      if (adminKey === null) throw new Error("Admin key is not set.");
      if (action === "start") return api.start(id, { adminKey });
      // The backend requires a reviewer on both decisions; never send a decision without one.
      if (decision === undefined || decision.reviewer.trim() === "") throw new Error("A reviewer name is required.");
      return api[action](id, decision, { adminKey });
    },
    onMutate: async ({ id }) => {
      await queryClient.cancelQueries({ queryKey: reviewKeys.detail(id) });
    },
    onSuccess: async (review, { action, from }) => {
      await queryClient.cancelQueries({ queryKey: reviewKeys.detail(review.id) });
      queryClient.setQueryData(reviewKeys.detail(review.id), review);
      void queryClient.invalidateQueries({ queryKey: reviewKeys.lists() });
      notify.success(actionSuccessMessage(action, from, review.status));
    },
    onError: (error) => {
      notify.error(describeActionError(error));
    },
    onSettled: (_data, _error, variables) => {
      void queryClient.invalidateQueries({ queryKey: reviewKeys.detail(variables.id) });
      void queryClient.invalidateQueries({ queryKey: reviewKeys.lists() });
    },
  };
}

/** Start, approve or reject a review. See reviewActionMutationOptions for the lifecycle. */
export function useReviewAction() {
  const { adminKey } = useAdminKey();
  const queryClient = useQueryClient();

  return useMutation(
    reviewActionMutationOptions({
      adminKey,
      queryClient,
      api: reviewsApi,
      notify: {
        success: (message) => toast.success(message),
        error: (message) => toast.error(message),
      },
    }),
  );
}
