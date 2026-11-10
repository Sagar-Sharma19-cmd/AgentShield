"use client";

import { RiskTierBadge } from "@/components/security/risk-tier-badge";
import { DashboardCard, SectionError } from "@/components/dashboard/section-states";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { ReviewStatusBadge } from "@/components/reviews/review-status-badge";
import { useReview } from "@/lib/queries/reviews";
import { resolveAgent, type AgentLookup, type ConfirmableAction } from "@/lib/reviews/model";
import type { ReviewRequestResponse } from "@/types/api";
import { ReviewActions } from "./review-actions";
import {
  AgentToolSection,
  AuditSection,
  GrantSection,
  RequestSection,
  TrajectorySection,
} from "./review-detail-sections";

interface ReviewDetailSheetProps {
  /** Selected review id from the URL. The sheet is open whenever this is set. */
  reviewId: string | undefined;
  onClose: () => void;
  agentLookup: AgentLookup;
  /** From the URL (Overview triage A/R): pre-open this action's confirmation dialog, if allowed. */
  requestedConfirm?: ConfirmableAction;
  /** Called once that confirmation dialog closes, confirmed or cancelled. */
  onConfirmHandled?: () => void;
}

/**
 * Full review record. The detail is fetched by id, so a deep link or a review that changed on the
 * server since the queue loaded still shows the current state.
 */
export function ReviewDetailSheet({ reviewId, onClose, agentLookup, requestedConfirm, onConfirmHandled }: ReviewDetailSheetProps) {
  const query = useReview(reviewId);

  return (
    <Sheet open={reviewId !== undefined} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader className="pr-10">
          <SheetTitle>Review detail</SheetTitle>
          <SheetDescription className="font-mono text-xs break-all">{reviewId}</SheetDescription>
        </SheetHeader>

        <div className="flex flex-col gap-6 px-4 pb-6">
          {query.isPending && <DetailLoading />}
          {query.isError && (
            <SectionError error={query.error} onRetry={() => void query.refetch()} subject="this review" />
          )}
          {query.isSuccess && (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <ReviewStatusBadge status={query.data.status} />
                <RiskTierBadge tier={query.data.riskTier} />
              </div>
              <ReviewDetailBody
                review={query.data}
                agentLookup={agentLookup}
                requestedConfirm={requestedConfirm}
                onConfirmHandled={onConfirmHandled}
              />
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function ReviewDetailBody({
  review,
  agentLookup,
  requestedConfirm,
  onConfirmHandled,
}: {
  review: ReviewRequestResponse;
  agentLookup: AgentLookup;
  requestedConfirm?: ConfirmableAction;
  onConfirmHandled?: () => void;
}) {
  const agent = resolveAgent(agentLookup, review.agentId);

  return (
    <>
      <DashboardCard
        title="Why this was held"
        description="The gateway's explanation, as recorded on the review."
        className="h-auto"
      >
        <div className="flex flex-col gap-3">
          <p className="text-sm">{review.reason}</p>
        </div>
      </DashboardCard>
      <DashboardCard title="Overview" className="h-auto">
        <div className="flex flex-col gap-6">
          <AgentToolSection review={review} agent={agent} />
          <RequestSection review={review} />
          <TrajectorySection review={review} />
          <GrantSection agentId={review.agentId} tool={review.tool} />
          <AuditSection requestId={review.requestId} />
        </div>
      </DashboardCard>
      <ReviewActions review={review} requestedConfirm={requestedConfirm} onConfirmHandled={onConfirmHandled} />
    </>
  );
}

function DetailLoading() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true" aria-label="Loading review">
      <Skeleton className="h-6 w-40" />
      <Skeleton className="h-16 w-full" />
      <Skeleton className="h-24 w-full" />
    </div>
  );
}
