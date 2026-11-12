"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { DecisionPath } from "@/components/activity/decision-path";
import { ContentFindings } from "@/components/inspection/content-findings";
import { SectionError } from "@/components/dashboard/section-states";
import { RiskTierBadge } from "@/components/security/risk-tier-badge";
import { TrajectorySummary } from "@/components/trajectory/trajectory-evidence";
import { Skeleton } from "@/components/ui/skeleton";
import type { ReviewOutcome } from "@/lib/activity/decision-path";
import { ApiError } from "@/lib/api/client";
import { ACTION_LABELS } from "@/lib/labels";
import { useAuditEvent } from "@/lib/queries/audit";
import { useReview } from "@/lib/queries/reviews";
import { isEffectivelyExpired } from "@/lib/reviews/expiry";
import { resolveAgentLookup, type AgentLookup, type ConfirmableAction } from "@/lib/reviews/model";
import { resolvedSignal } from "@/lib/reviews/signal";
import { REVIEW_TAB_LABELS, buildWorkspaceHref, tabFor, type ReviewTab } from "@/lib/reviews/tabs";
import { trajectoryEvidence } from "@/lib/trajectory/model";
import type { ReviewRequestResponse } from "@/types/api";
import { ExpiryCountdown } from "./expiry-countdown";
import { ReviewActions } from "./review-actions";
import { GrantSection, RequestFacts } from "./review-detail-sections";
import { ReviewSignalMark } from "./review-signal";
import { ReviewStamp } from "./review-status-badge";
import { ReviewTimeline } from "./review-timeline";

export interface ReviewDetailProps {
  reviewId: string;
  /** The tab the operator is on, to point at the review's new tab after its status changes. */
  tab: ReviewTab;
  now: number;
  agentLookup: AgentLookup;
  requestedConfirm?: ConfirmableAction;
  onConfirmHandled?: () => void;
  /** Renders the title. The sheet passes its SheetTitle so the dialog is labelled by it; the pane uses an h2. */
  renderTitle?: (title: React.ReactNode) => React.ReactNode;
}

/**
 * Full review, fetched by id so a deep link, or a review that changed since the queue loaded, shows the
 * current state. Header, why it needs review (decision path), timeline, actions, request facts.
 */
export function ReviewDetail({ reviewId, ...props }: ReviewDetailProps) {
  const query = useReview(reviewId);

  if (query.isPending) return <DetailSkeleton />;
  if (query.isError) return <SectionError error={query.error} onRetry={() => void query.refetch()} subject="this review" />;
  // Keyed by id: switching reviews never carries over dialog, note or feedback state.
  return <ReviewDetailBody key={query.data.id} review={query.data} {...props} />;
}

function ReviewDetailBody({
  review,
  tab,
  now,
  agentLookup,
  requestedConfirm,
  onConfirmHandled,
  renderTitle,
}: Omit<ReviewDetailProps, "reviewId"> & { review: ReviewRequestResponse }) {
  const agent = resolveAgentLookup(agentLookup, review.agentId);
  const agentName = agent.kind === "found" ? agent.agent.name : null;
  const expired = isEffectivelyExpired(review, now);
  const homeTab = tabFor(review, now);
  const showCountdown = review.status === "PENDING" || review.status === "IN_REVIEW" || (review.status === "APPROVED" && !review.consumedAt);
  const title = (
    <>
      {ACTION_LABELS[review.action]} <span className="text-muted-foreground">with</span> <span className="font-mono">{review.tool}</span>
    </>
  );

  return (
    <article className="flex flex-col gap-6" aria-label="Review detail">
      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <ReviewStamp status={review.status} expired={expired} />
          {showCountdown ? (
            <span className="text-xs">
              {review.status === "APPROVED" ? <span className="text-muted-foreground">Claim window: </span> : null}
              <ExpiryCountdown review={review} now={now} />
            </span>
          ) : null}
        </div>
        {renderTitle ? renderTitle(title) : <h2 className="text-lg font-semibold tracking-tight">{title}</h2>}
        <p className="truncate font-mono text-xs text-muted-foreground" title={review.resource}>
          <span className="sr-only">Resource: </span>
          {review.resource}
        </p>
        <dl className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
          <div className="flex items-center gap-1.5">
            <dt className="text-muted-foreground">Agent</dt>
            <dd className="font-medium">{agentName ?? <span className="font-mono text-xs">{review.agentId}</span>}</dd>
          </div>
          <div className="flex items-center gap-1.5">
            <dt className="text-muted-foreground">Effective score</dt>
            <dd className="font-mono tabular-nums">
              {review.riskScore}
              <span className="text-muted-foreground">/100</span>
            </dd>
          </div>
          <div className="flex items-center gap-1.5">
            <dt className="sr-only">Tier</dt>
            <dd>
              <RiskTierBadge tier={review.riskTier} />
            </dd>
          </div>
        </dl>
        {homeTab !== tab ? (
          <p role="status" className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-sm">
            This review is now on the {REVIEW_TAB_LABELS[homeTab]} tab.
            <Link
              href={buildWorkspaceHref({ tab: homeTab, review: review.id })}
              className="inline-flex items-center gap-1 rounded-sm text-primary underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
            >
              Go to {REVIEW_TAB_LABELS[homeTab]}
              <ArrowRight aria-hidden="true" className="size-3.5" />
            </Link>
          </p>
        ) : null}
      </header>

      <WhySection review={review} now={now} />

      <section aria-labelledby="review-findings-heading" className="flex flex-col gap-3">
        <h3 id="review-findings-heading" className="text-sm font-medium">
          Content findings
        </h3>
        <ContentFindings findings={review.inspectionFindings} />
      </section>

      <section aria-labelledby="review-timeline-heading" className="flex flex-col gap-3">
        <h3 id="review-timeline-heading" className="text-sm font-medium">
          Timeline
        </h3>
        <ReviewTimeline review={review} now={now} />
      </section>

      <ReviewActions review={review} now={now} requestedConfirm={requestedConfirm} onConfirmHandled={onConfirmHandled} />

      <RequestFacts review={review} agentName={agentName} />
      <GrantSection agent={agent} tool={review.tool} />
    </article>
  );
}

/**
 * Why the gateway held it: the signal that escalated it, the recorded reason, the decision path from the
 * audit row (the same DecisionPath as Activity) and, when present, the trajectory factors.
 */
function WhySection({ review, now }: { review: ReviewRequestResponse; now: number }) {
  const audit = useAuditEvent(review.requestId);
  // What happened after the hold, so the decision step does not keep saying "held for review" once decided.
  const reviewOutcome: ReviewOutcome = {
    status: review.status,
    reviewer: review.reviewer,
    claimed: review.consumedAt !== null,
    expired: isEffectivelyExpired(review, now),
  };
  const signal = resolvedSignal(review, audit.data);
  const evidence = trajectoryEvidence(review);
  const notFound = audit.error instanceof ApiError && audit.error.status === 404;

  return (
    <section aria-labelledby="review-why-heading" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id="review-why-heading" className="text-sm font-medium">
          Why it needs review
        </h3>
        <span className="text-xs text-muted-foreground">
          Sent by <ReviewSignalMark signal={signal} className="text-foreground" />
        </span>
      </div>
      <blockquote className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm leading-relaxed">
        <span className="sr-only">Recorded reason: </span>
        {review.reason}
      </blockquote>
      {evidence.kind === "evaluated" ? (
        <div className="rounded-md border border-border px-3 py-2">
          <TrajectorySummary evidence={evidence} />
        </div>
      ) : null}
      <div className="flex flex-col gap-2">
        <p className="font-mono text-[0.6875rem] tracking-wide text-muted-foreground uppercase">Decision path</p>
        {audit.isPending ? (
          <div className="flex flex-col gap-3" aria-busy="true" aria-label="Loading the decision path">
            {Array.from({ length: 4 }, (_, index) => (
              <Skeleton key={index} className="h-8 w-full" />
            ))}
          </div>
        ) : notFound ? (
          <p className="text-sm text-muted-foreground">No audit record exists for this request, so the decision path cannot be shown.</p>
        ) : audit.isError ? (
          <p role="alert" className="text-sm text-danger-text">
            The decision path could not be loaded: {audit.error.message}
          </p>
        ) : (
          <DecisionPath event={audit.data} reviewOutcome={reviewOutcome} />
        )}
      </div>
    </section>
  );
}

function DetailSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true" aria-label="Loading review">
      <div className="flex justify-between">
        <Skeleton className="h-7 w-28" />
        <Skeleton className="h-5 w-32" />
      </div>
      <Skeleton className="h-6 w-2/3" />
      <Skeleton className="h-4 w-1/2" />
      <Skeleton className="h-20 w-full" />
      <Skeleton className="h-40 w-full" />
    </div>
  );
}
