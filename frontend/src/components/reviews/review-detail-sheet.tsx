"use client";

import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import type { AgentLookup, ConfirmableAction } from "@/lib/reviews/model";
import type { ReviewTab } from "@/lib/reviews/tabs";
import { ReviewDetail } from "./review-detail";

interface ReviewDetailSheetProps {
  /** Selected review id from the URL. The sheet is open whenever this is set. */
  reviewId: string | undefined;
  tab: ReviewTab;
  now: number;
  onClose: () => void;
  agentLookup: AgentLookup;
  /** From the URL (triage or queue A/R): pre-open this action's confirmation dialog, if allowed. */
  requestedConfirm?: ConfirmableAction;
  /** Called once that confirmation dialog closes, confirmed or cancelled. */
  onConfirmHandled?: () => void;
}

/**
 * Below `lg` the review detail opens in a sheet over the queue, with the same content as the desktop
 * pane. The sheet's own title is fixed, so the dialog is labelled even while the review loads.
 */
export function ReviewDetailSheet({ reviewId, tab, now, onClose, agentLookup, requestedConfirm, onConfirmHandled }: ReviewDetailSheetProps) {
  return (
    <Sheet open={reviewId !== undefined} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader className="pr-10">
          <SheetTitle className="font-mono text-[0.6875rem] font-medium tracking-wide text-muted-foreground uppercase">
            Review detail
          </SheetTitle>
          <SheetDescription className="sr-only">The held request, why it needs review, its timeline and the decision.</SheetDescription>
        </SheetHeader>
        <div className="px-4 pb-6">
          {reviewId !== undefined ? (
            <ReviewDetail
              reviewId={reviewId}
              tab={tab}
              now={now}
              agentLookup={agentLookup}
              requestedConfirm={requestedConfirm}
              onConfirmHandled={onConfirmHandled}
              renderTitle={(title) => <h3 className="text-lg font-semibold tracking-tight">{title}</h3>}
            />
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}
