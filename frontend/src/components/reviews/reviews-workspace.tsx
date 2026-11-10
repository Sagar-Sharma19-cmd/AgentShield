"use client";

import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { RotateCw } from "lucide-react";
import { DashboardCard, SectionEmpty, SectionError, SectionSkeleton } from "@/components/dashboard/section-states";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAgentRegistry } from "@/lib/queries/agents";
import { refreshReviewWorkspace, useReviewCounts, useReviewsByStatus } from "@/lib/queries/reviews";
import {
  REVIEW_STATUS_LABELS,
  REVIEW_STATUSES,
  buildReviewHref,
  sortNewestFirst,
  type AgentLookup,
  type ReviewUrlState,
} from "@/lib/reviews/model";
import type { ReviewStatus } from "@/types/api";
import { ReviewDetailSheet } from "./review-detail-sheet";
import { ReviewQueue } from "./review-queue";

const EMPTY_COPY: Record<ReviewStatus, { title: string; body: string }> = {
  PENDING: {
    title: "No reviews waiting to start",
    body: "A held request appears here when a gateway evaluation ends in REVIEW.",
  },
  IN_REVIEW: {
    title: "Nothing is in review",
    body: "Start a pending review to move it here while you decide.",
  },
  APPROVED: {
    title: "No approved reviews",
    body: "Approved reviews are recorded here. Approval never grants tool access on its own.",
  },
  REJECTED: {
    title: "No rejected reviews",
    body: "Rejected reviews are recorded here.",
  },
};

/**
 * Review queue with status tabs. The status and the selected review live in the URL, so a filtered
 * view or an open review can be linked and survives reloads.
 */
export function ReviewsWorkspace({ state }: { state: ReviewUrlState }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const queue = useReviewsByStatus(state.status);
  const { counts, isError: countsFailed } = useReviewCounts();
  const registry = useAgentRegistry();

  // Known data wins over a later refetch error, so a background failure does not hide agent names.
  const agentLookup: AgentLookup = registry.data
    ? { state: "ready", agents: registry.data }
    : registry.isError
      ? { state: "error" }
      : { state: "loading" };
  const agentNames = new Map((registry.data ?? []).map((agent) => [agent.id, agent.name]));
  const reviews = sortNewestFirst(queue.data ?? []);

  function navigate(next: { status: ReviewStatus; review?: string }) {
    router.push(buildReviewHref(next));
  }

  /** Drops a handled `confirm` from the URL, so a reload or Back does not reopen the dialog. */
  function clearConfirm() {
    if (state.confirm) router.replace(buildReviewHref({ status: state.status, review: state.review }));
  }

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-5 p-4 md:p-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">Reviews</h1>
          <p className="text-sm text-muted-foreground">
            Requests the gateway held for a human decision. Each review is recorded; none change access on their own.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void refreshReviewWorkspace(queryClient)}
        >
          <RotateCw aria-hidden="true" />
          Refresh
        </Button>
      </header>

      <Tabs value={state.status} onValueChange={(value) => navigate({ status: value as ReviewStatus })}>
        <TabsList aria-label="Filter reviews by status" className="flex h-auto w-full flex-wrap justify-start">
          {REVIEW_STATUSES.map((status) => (
            <TabsTrigger key={status} value={status} className="gap-2">
              {REVIEW_STATUS_LABELS[status]}
              <span className="font-mono text-xs tabular-nums text-muted-foreground">
                {counts[status] ?? "–"}
              </span>
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {countsFailed && (
        <p role="status" className="text-xs text-muted-foreground">
          Some status counts could not be loaded. The queue below is still current for the selected tab.
        </p>
      )}

      <DashboardCard title={`${REVIEW_STATUS_LABELS[state.status]} reviews`} description={queueDescription(state.status)}>
        {queue.isPending ? (
          <SectionSkeleton label="Loading reviews" rows={4} />
        ) : queue.isError ? (
          <SectionError error={queue.error} onRetry={() => void queue.refetch()} subject="reviews" />
        ) : reviews.length === 0 ? (
          <SectionEmpty title={EMPTY_COPY[state.status].title} body={EMPTY_COPY[state.status].body} />
        ) : (
          <ReviewQueue
            reviews={reviews}
            agentNames={agentNames}
            selectedId={state.review}
            onSelect={(id) => navigate({ status: state.status, review: id })}
          />
        )}
      </DashboardCard>

      <ReviewDetailSheet
        reviewId={state.review}
        onClose={() => navigate({ status: state.status })}
        agentLookup={agentLookup}
        requestedConfirm={state.confirm}
        onConfirmHandled={clearConfirm}
      />
    </div>
  );
}

function queueDescription(status: ReviewStatus): string {
  switch (status) {
    case "PENDING":
      return "Waiting for a reviewer to start.";
    case "IN_REVIEW":
      return "Started and awaiting an approve or reject decision.";
    case "APPROVED":
      return "Decided as approved. Recorded only; no tool permission was granted.";
    case "REJECTED":
      return "Decided as rejected. Recorded only.";
  }
}
