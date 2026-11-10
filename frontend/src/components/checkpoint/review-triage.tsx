"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { SectionError } from "@/components/dashboard/section-states";
import { ReviewStatusBadge } from "@/components/reviews/review-status-badge";
import { RiskTierBadge } from "@/components/security/risk-tier-badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { openReviews, triageKey } from "@/lib/checkpoint/triage";
import { formatTimestamp } from "@/lib/format";
import { ACTION_LABELS } from "@/lib/labels";
import { useReviewsByStatus } from "@/lib/queries/reviews";
import { buildReviewHref } from "@/lib/reviews/model";
import { cn } from "@/lib/utils";
import type { ReviewRequestResponse } from "@/types/api";
import { Kbd } from "@/components/shell/command-palette";
import { CheckpointPanel } from "./checkpoint-panel";

/** Rows shown on the Overview. The full queue is on the Reviews page. */
const TRIAGE_LIMIT = 6;

/**
 * Open reviews (PENDING and IN_REVIEW) from the existing review list queries, as a keyboard-first
 * listbox. J/K move, Enter opens the review, A/R open the existing confirmation on the Reviews page.
 * Nothing is decided from here: every decision still goes through that confirmation dialog.
 */
export function ReviewTriage() {
  const pending = useReviewsByStatus("PENDING");
  const inReview = useReviewsByStatus("IN_REVIEW");
  const all = openReviews(pending.data, inReview.data);
  const isPending = pending.isPending && inReview.isPending;
  const failed = pending.isError && inReview.isError;
  const partial = !failed && (pending.isError || inReview.isError);

  return (
    <CheckpointPanel
      eyebrow="Review triage"
      title={all.length > 0 ? `${all.length} open ${all.length === 1 ? "review" : "reviews"}` : "Open reviews"}
      description="Requests the gateway held for a human decision."
      action={
        <Button asChild variant="ghost" size="sm">
          <Link href={buildReviewHref({ status: "PENDING" })}>
            All reviews
            <ArrowRight aria-hidden="true" />
          </Link>
        </Button>
      }
    >
      {isPending ? (
        <TriageSkeleton />
      ) : failed ? (
        <SectionError
          error={pending.error ?? inReview.error ?? new Error("Reviews could not be loaded.")}
          onRetry={() => {
            void pending.refetch();
            void inReview.refetch();
          }}
          subject="open reviews"
        />
      ) : all.length === 0 ? (
        <TriageEmpty />
      ) : (
        <TriageList reviews={all.slice(0, TRIAGE_LIMIT)} hiddenCount={Math.max(0, all.length - TRIAGE_LIMIT)} />
      )}
      {partial ? (
        <p role="status" className="text-xs text-warning-text">
          Some open reviews could not be loaded. The list may be incomplete.
        </p>
      ) : null}
    </CheckpointPanel>
  );
}

function TriageList({ reviews, hiddenCount }: { reviews: ReviewRequestResponse[]; hiddenCount: number }) {
  const router = useRouter();
  const baseId = useId();
  const hintId = useId();
  const [activeIndex, setActiveIndex] = useState(0);
  const [hint, setHint] = useState("");
  const active = Math.min(activeIndex, reviews.length - 1);
  const optionId = (index: number) => `${baseId}-option-${index}`;

  function open(review: ReviewRequestResponse) {
    router.push(buildReviewHref({ status: review.status, review: review.id }));
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLUListElement>) {
    const result = triageKey(event, reviews, active);
    if (result.kind === "none") return;
    event.preventDefault();
    setHint("");
    switch (result.kind) {
      case "move":
        setActiveIndex(result.index);
        document.getElementById(optionId(result.index))?.scrollIntoView({ block: "nearest" });
        break;
      case "open":
        router.push(buildReviewHref({ status: result.status, review: result.reviewId }));
        break;
      case "confirm":
        router.push(buildReviewHref({ status: result.status, review: result.reviewId, confirm: result.action }));
        break;
      case "needs-start":
        setHint(
          `This review has not been started. Press Enter to open it and start it; ${result.action === "approve" ? "approve" : "reject"} becomes available once it is in review.`,
        );
        break;
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <ul
        role="listbox"
        tabIndex={0}
        aria-label="Open reviews. J and K move, Enter opens, A approves and R rejects after confirmation."
        aria-activedescendant={optionId(active)}
        aria-describedby={hintId}
        onKeyDown={onKeyDown}
        className="flex flex-col divide-y divide-border overflow-hidden rounded-lg border border-border outline-none focus-visible:ring-3 focus-visible:ring-ring/60"
      >
        {reviews.map((review, index) => {
          const selected = index === active;
          return (
            <li
              key={review.id}
              id={optionId(index)}
              role="option"
              aria-selected={selected}
              onClick={() => {
                setActiveIndex(index);
                open(review);
              }}
              className={cn(
                "relative flex cursor-pointer flex-col gap-2 px-3 py-2.5 transition-colors duration-150 motion-reduce:transition-none",
                selected ? "bg-muted" : "hover:bg-muted/50",
              )}
            >
              {selected ? <span aria-hidden="true" className="absolute inset-y-2 left-0 w-[3px] rounded-full bg-primary" /> : null}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  <RiskTierBadge tier={review.riskTier} />
                  <span className="font-mono text-xs tabular-nums">
                    {review.riskScore}
                    <span className="text-muted-foreground">/100</span>
                  </span>
                  {review.trajectoryScore !== null ? (
                    <span className="rounded-md border border-border px-1.5 font-mono text-[0.6875rem] leading-5 text-muted-foreground">
                      Trajectory <span className="text-foreground tabular-nums">{review.trajectoryScore}</span>
                    </span>
                  ) : null}
                </div>
                <ReviewStatusBadge status={review.status} />
              </div>
              <p className="min-w-0 truncate text-sm">
                <span className="font-medium">{ACTION_LABELS[review.action]}</span>
                <span className="text-muted-foreground"> with </span>
                <span className="font-mono text-xs">{review.tool}</span>
                <span className="text-muted-foreground"> on </span>
                <span className="font-mono text-xs">{review.resource}</span>
              </p>
              <p className="flex flex-wrap justify-between gap-2 font-mono text-[0.6875rem] text-muted-foreground">
                <span className="truncate">{review.agentId}</span>
                <time dateTime={review.createdAt} className="tabular-nums">
                  {formatTimestamp(review.createdAt)}
                </time>
              </p>
            </li>
          );
        })}
      </ul>

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <p aria-hidden="true" className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span><Kbd>J</Kbd> <Kbd>K</Kbd> move</span>
          <span><Kbd>↵</Kbd> open</span>
          <span><Kbd>A</Kbd> approve</span>
          <span><Kbd>R</Kbd> reject</span>
        </p>
        {hiddenCount > 0 ? <span>{hiddenCount} more on the Reviews page</span> : null}
      </div>
      <p className="text-xs text-muted-foreground">A and R open the confirmation on the Reviews page. Nothing is decided here.</p>
      <p id={hintId} role="status" className={cn("text-xs text-warning-text", !hint && "sr-only")}>
        {hint}
      </p>
    </div>
  );
}

function TriageEmpty() {
  return (
    <div className="flex flex-1 flex-col items-start gap-3 rounded-lg border border-dashed border-border px-4 py-6">
      <p className="text-sm font-medium">Nothing is waiting for a decision.</p>
      <p className="max-w-sm text-sm text-muted-foreground">
        When the gateway holds a request, it lands here, ready to triage from the keyboard: <Kbd>J</Kbd> <Kbd>K</Kbd> to
        move, <Kbd>↵</Kbd> to open.
      </p>
      <Button asChild variant="outline" size="sm">
        <Link href={buildReviewHref({ status: "APPROVED" })}>See decided reviews</Link>
      </Button>
    </div>
  );
}

function TriageSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading open reviews" className="flex flex-col divide-y divide-border overflow-hidden rounded-lg border border-border">
      {Array.from({ length: 3 }, (_, index) => (
        <div key={index} className="flex flex-col gap-2 px-3 py-2.5">
          <div className="flex justify-between">
            <Skeleton className="h-6 w-28" />
            <Skeleton className="h-6 w-20" />
          </div>
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      ))}
    </div>
  );
}
