"use client";

import { useState } from "react";
import { ReviewStatusBadge } from "@/components/reviews/review-status-badge";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useReviewAction } from "@/lib/queries/reviews";
import {
  REVIEW_ACTION_COPY,
  actionSuccessMessage,
  availableReviewActions,
  describeActionError,
  initialConfirmation,
  type ConfirmableAction,
  type ReviewAction,
} from "@/lib/reviews/model";
import type { ReviewRequestResponse } from "@/types/api";

interface Feedback {
  tone: "success" | "error";
  text: string;
}

/**
 * Start / approve / reject for one review. Only the actions the backend accepts from the current
 * status are offered. Approve and reject ask for confirmation, because they are final.
 *
 * `requestedConfirm` (from an Overview triage link) only pre-opens that same confirmation dialog,
 * and only when the current status allows the action. Nothing runs until the operator confirms.
 */
export function ReviewActions({
  review,
  requestedConfirm,
  onConfirmHandled,
}: {
  review: ReviewRequestResponse;
  requestedConfirm?: ConfirmableAction;
  onConfirmHandled?: () => void;
}) {
  const mutation = useReviewAction();
  const [confirming, setConfirming] = useState<ReviewAction | null>(() => initialConfirmation(review.status, requestedConfirm));
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const actions = availableReviewActions(review.status);

  function run(action: ReviewAction) {
    const from = review.status;
    setFeedback(null);
    // Toasts are raised by the mutation hook, so they survive unmount. These per-call callbacks
    // only run while this component is mounted, and they show the inline message.
    mutation.mutate(
      { id: review.id, action, from },
      {
        onSuccess: (updated) => {
          setFeedback({ tone: "success", text: actionSuccessMessage(action, from, updated.status) });
        },
        onError: (error) => {
          setFeedback({ tone: "error", text: describeActionError(error) });
        },
      },
    );
  }

  return (
    <section aria-labelledby="review-actions-heading" className="flex flex-col gap-3">
      <h3 id="review-actions-heading" className="text-sm font-medium">
        Decision
      </h3>

      {actions.length === 0 ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          This review is <ReviewStatusBadge status={review.status} />. Decisions are final.
        </p>
      ) : (
        <div className="flex flex-col gap-2 sm:flex-row">
          {actions.map((action) => {
            const isApprove = action === "approve";
            const isReject = action === "reject";
            return (
              <Button
                key={action}
                variant={isReject ? "outline" : isApprove ? "default" : "secondary"}
                disabled={mutation.isPending}
                onClick={() => (action === "start" ? run(action) : setConfirming(action))}
                className="w-full sm:w-auto"
              >
                {REVIEW_ACTION_COPY[action].label}
              </Button>
            );
          })}
        </div>
      )}

      {mutation.isPending && (
        <p role="status" className="text-xs text-muted-foreground">
          Saving the decision…
        </p>
      )}

      {feedback && (
        <p
          role={feedback.tone === "error" ? "alert" : "status"}
          className={
            feedback.tone === "error"
              ? "rounded-md border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger-text"
              : "rounded-md border border-success/30 bg-success/10 px-3 py-2 text-sm text-success-text"
          }
        >
          {feedback.text}
        </p>
      )}

      <AlertDialog
        open={confirming !== null}
        onOpenChange={(open) => {
          if (open) return;
          setConfirming(null);
          onConfirmHandled?.();
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirming ? REVIEW_ACTION_COPY[confirming].confirmTitle : ""}</AlertDialogTitle>
            <AlertDialogDescription>
              {confirming ? REVIEW_ACTION_COPY[confirming].confirmBody : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirming) run(confirming);
                setConfirming(null);
              }}
            >
              {confirming ? REVIEW_ACTION_COPY[confirming].label : "Confirm"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
