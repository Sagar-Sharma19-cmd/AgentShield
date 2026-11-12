"use client";

import Link from "next/link";
import { PageContainer, PageHeader } from "@/components/shell/page-header";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { Inbox, MousePointerClick, RotateCw } from "lucide-react";
import { SectionError } from "@/components/dashboard/section-states";
import { Kbd } from "@/components/shell/command-palette";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { resolveAgent } from "@/lib/agents/resolve";
import { useAgentRegistry } from "@/lib/queries/agents";
import { refreshReviewWorkspace, useReviewAction, useReviewLists } from "@/lib/queries/reviews";
import type { AgentLookup } from "@/lib/reviews/model";
import {
  REVIEW_TAB_LABELS,
  REVIEW_TABS,
  TAB_STATUSES,
  buildWorkspaceHref,
  partitionReviews,
  tabCounts,
  type ReviewTab,
  type ReviewWorkspaceState,
} from "@/lib/reviews/tabs";
import type { ReviewRequestResponse, ReviewStatus } from "@/types/api";
import { ReviewDetail } from "./review-detail";
import { ReviewDetailSheet } from "./review-detail-sheet";
import { ReviewQueue } from "./review-queue";
import { useIsDesktop, useNow } from "./use-review-clock";

const TAB_DESCRIPTIONS: Record<ReviewTab, string> = {
  "needs-action": "Pending and in-review requests, soonest to expire first.",
  approved: "Approved. The agent can claim each approval once, before it expires, to run exactly that request.",
  rejected: "Rejected, with the reviewer's note. The agent is told why.",
  expired: "Timed out before a decision. They can no longer be started, decided or claimed.",
};

/**
 * The Reviews workspace ("Checkpoint" language): status tabs with counts, the queue on the left and the
 * selected review on the right from `lg` up. Below `lg`, the review opens in the existing sheet.
 * Tab and selection live in the URL, so a view can be linked and Back works.
 */
export function ReviewsWorkspace({ state }: { state: ReviewWorkspaceState }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const lists = useReviewLists();
  const registry = useAgentRegistry();
  const startMutation = useReviewAction();
  const now = useNow();
  const isDesktop = useIsDesktop();

  const data = Object.fromEntries(Object.entries(lists).map(([status, query]) => [status, query.data])) as Partial<
    Record<ReviewStatus, ReviewRequestResponse[] | undefined>
  >;
  // With the clock, so a review leaves Needs action when it expires, at the same moment as the sidebar badge.
  const tabs = partitionReviews(data, now);
  const counts = tabCounts(tabs);
  const sources = TAB_STATUSES[state.tab].map((status) => lists[status]);
  const reviews = tabs[state.tab];
  const failed = sources.find((query) => query.isError && query.data === undefined);
  // Another tab's list failed while this tab's loaded: say why that count is missing.
  const partialFailure = !failed && Object.values(lists).some((query) => query.isError);

  // Known data wins over a later refetch error, so a background failure does not hide agent names.
  const agentLookup: AgentLookup = registry.data
    ? { state: "ready", agents: registry.data }
    : registry.isError
      ? { state: "error" }
      : { state: "loading" };
  // Keyed by the review's agentId (a UUID, or a name some agents send), resolved with the shared helper.
  const agentNames = new Map(
    Object.values(data)
      .flatMap((list) => list ?? [])
      .map((review) => [review.agentId, resolveAgent(review.agentId, registry.data ?? [])?.name] as const)
      .filter((entry): entry is readonly [string, string] => entry[1] !== undefined),
  );

  function navigate(next: ReviewWorkspaceState) {
    router.push(buildWorkspaceHref(next));
  }

  /** Drops a handled `confirm` from the URL, so a reload or Back does not reopen the dialog. */
  function clearConfirm() {
    if (state.confirm) router.replace(buildWorkspaceHref({ tab: state.tab, review: state.review }));
  }

  function start(review: ReviewRequestResponse) {
    // Same mutation and toast as the Start review button. Opening the review shows the result in place.
    startMutation.mutate({ id: review.id, action: "start", from: review.status });
    if (review.id !== state.review) navigate({ tab: state.tab, review: review.id });
  }

  const actionable = state.tab === "needs-action";

  return (
    <PageContainer>
      <PageHeader
        eyebrow="Respond · Human review"
        title="Reviews"
        description="Requests held for a human decision. An approval lets the agent run that exact request once; it never changes a grant."
        actions={
          <Button variant="outline" size="sm" onClick={() => void refreshReviewWorkspace(queryClient)}>
            <RotateCw aria-hidden="true" />
            Refresh
          </Button>
        }
      />

      <Tabs value={state.tab} onValueChange={(value) => navigate({ tab: value as ReviewTab })}>
        <TabsList aria-label="Reviews by status" className="flex h-auto w-full flex-wrap justify-start">
          {REVIEW_TABS.map((tab) => (
            <TabsTrigger key={tab} value={tab} className="gap-2">
              {REVIEW_TAB_LABELS[tab]}
              <span className="font-mono text-xs tabular-nums text-muted-foreground">
                <span className="sr-only">, </span>
                {counts[tab] ?? "–"}
                <span className="sr-only">{counts[tab] === undefined ? " count not loaded" : counts[tab] === 1 ? " review" : " reviews"}</span>
              </span>
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {partialFailure ? (
        <p role="status" className="text-xs text-muted-foreground">
          Some status lists could not be loaded, so a count shows “–”. The tabs that loaded are current.
        </p>
      ) : null}

      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(20rem,26rem)_minmax(0,1fr)]">
        <section aria-labelledby="review-queue-heading" className="flex min-w-0 flex-col gap-3">
          <div className="flex flex-col gap-0.5">
            <h2 id="review-queue-heading" className="font-mono text-[0.6875rem] tracking-[0.08em] text-muted-foreground uppercase">
              {REVIEW_TAB_LABELS[state.tab]} queue
            </h2>
            <p className="text-xs text-muted-foreground">{TAB_DESCRIPTIONS[state.tab]}</p>
          </div>
          {failed ? (
            <SectionError
              error={failed.error ?? new Error("Reviews could not be loaded.")}
              onRetry={() => sources.forEach((query) => void query.refetch())}
              subject="reviews"
            />
          ) : reviews === undefined ? (
            <QueueSkeleton />
          ) : reviews.length === 0 ? (
            <TabEmpty tab={state.tab} expiredCount={counts.expired} />
          ) : (
            <ReviewQueue
              key={state.tab}
              reviews={reviews}
              agentNames={agentNames}
              selectedId={state.review}
              now={now}
              label={`${REVIEW_TAB_LABELS[state.tab]} reviews`}
              actionable={actionable}
              onOpen={(id) => navigate({ tab: state.tab, review: id })}
              onConfirm={(id, action) => navigate({ tab: state.tab, review: id, confirm: action })}
              onStart={start}
            />
          )}
        </section>

        {isDesktop ? (
          // Sticky below the 56 px app header. Nothing here is transformed, so stickiness is not broken.
          <section
            aria-label="Selected review"
            className="sticky top-[4.5rem] max-h-[calc(100dvh-5.5rem)] min-w-0 overflow-y-auto rounded-lg border border-border bg-card p-5"
          >
            {state.review ? (
              <ReviewDetail
                reviewId={state.review}
                tab={state.tab}
                now={now}
                agentLookup={agentLookup}
                requestedConfirm={state.confirm}
                onConfirmHandled={clearConfirm}
              />
            ) : reviews === undefined && !failed ? (
              <DetailPlaceholderSkeleton />
            ) : (
              <NothingSelected hasReviews={(reviews?.length ?? 0) > 0} />
            )}
          </section>
        ) : null}
      </div>

      {!isDesktop ? (
        <ReviewDetailSheet
          reviewId={state.review}
          tab={state.tab}
          now={now}
          onClose={() => navigate({ tab: state.tab })}
          agentLookup={agentLookup}
          requestedConfirm={state.confirm}
          onConfirmHandled={clearConfirm}
        />
      ) : null}
    </PageContainer>
  );
}

function NothingSelected({ hasReviews }: { hasReviews: boolean }) {
  return (
    <div className="flex flex-col items-start gap-3 py-6">
      <span className="flex size-9 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <MousePointerClick aria-hidden="true" className="size-4" />
      </span>
      <p className="text-sm font-medium">{hasReviews ? "Select a review" : "Nothing to show"}</p>
      <p className="max-w-sm text-sm text-muted-foreground">
        {hasReviews ? (
          <>
            Click a row, or focus the queue and use <Kbd>J</Kbd> <Kbd>K</Kbd> to move and <Kbd>↵</Kbd> to open. Its decision path,
            timeline and actions appear here.
          </>
        ) : (
          "When this tab has reviews, the selected one appears here."
        )}
      </p>
    </div>
  );
}

const EMPTY_COPY: Record<Exclude<ReviewTab, "needs-action">, { title: string; body: string }> = {
  approved: {
    title: "No approved reviews",
    body: "Approved reviews are recorded here, with who approved them and whether the agent has claimed the approval.",
  },
  rejected: {
    title: "No rejected reviews",
    body: "Rejected reviews are recorded here, with the reviewer's note the agent was given.",
  },
  expired: {
    title: "Nothing has expired",
    body: "A review that is not decided before it expires (30 minutes after it was created, by default) moves here. It can no longer be acted on.",
  },
};

function TabEmpty({ tab, expiredCount }: { tab: ReviewTab; expiredCount: number | undefined }) {
  if (tab !== "needs-action") {
    const copy = EMPTY_COPY[tab];
    return (
      <div className="flex flex-col items-start gap-2 rounded-lg border border-dashed border-border px-4 py-6">
        <Inbox aria-hidden="true" className="size-4 text-muted-foreground" />
        <p className="text-sm font-medium">{copy.title}</p>
        <p className="max-w-sm text-sm text-muted-foreground">{copy.body}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-start gap-3 rounded-lg border border-dashed border-border px-4 py-6">
      <Inbox aria-hidden="true" className="size-4 text-muted-foreground" />
      <p className="text-sm font-medium">No requests are waiting for review</p>
      <p className="max-w-sm text-sm text-muted-foreground">
        A request lands here when the gateway holds it for a human. To create one, run the agent simulator. PolicyEngine sends
        every EXECUTE to review:
      </p>
      <pre className="w-full overflow-x-auto rounded-md border border-border bg-muted/40 px-3 py-2 font-mono text-xs leading-relaxed">
        <code>{"cd simulator\npython3 simulator.py --scenario review_required"}</code>
      </pre>
      <div className="flex flex-wrap gap-2">
        <Button asChild variant="outline" size="sm">
          <Link href="/pipeline">Open the CI/CD demo</Link>
        </Button>
        {expiredCount ? (
          <Button asChild variant="ghost" size="sm">
            <Link href={buildWorkspaceHref({ tab: "expired" })}>See {expiredCount} expired</Link>
          </Button>
        ) : null}
      </div>
    </div>
  );
}

/** Rows shaped like the queue's: title + status, resource, tier/score/signal, agent/age/countdown. */
function QueueSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading reviews" className="flex flex-col divide-y divide-border overflow-hidden rounded-lg border border-border">
      {Array.from({ length: 5 }, (_, index) => (
        <div key={index} className="flex flex-col gap-2 px-3 py-2.5">
          <div className="flex justify-between">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-6 w-20" />
          </div>
          <Skeleton className="h-3 w-3/4" />
          <Skeleton className="h-5 w-1/2" />
          <div className="flex justify-between">
            <Skeleton className="h-3 w-28" />
            <Skeleton className="h-3 w-24" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** The detail pane's shape while the queue loads: stamp, title, facts, then the decision path. */
function DetailPlaceholderSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-hidden="true">
      <div className="flex justify-between">
        <Skeleton className="h-7 w-28" />
        <Skeleton className="h-5 w-32" />
      </div>
      <Skeleton className="h-6 w-2/3" />
      <Skeleton className="h-4 w-1/2" />
      <Skeleton className="h-16 w-full" />
      <Skeleton className="h-48 w-full" />
    </div>
  );
}
