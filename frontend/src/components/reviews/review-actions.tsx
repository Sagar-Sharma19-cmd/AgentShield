"use client";

import { useId, useState } from "react";
import { ReviewStatusBadge } from "@/components/reviews/review-status-badge";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatTimestamp } from "@/lib/format";
import { loadReviewerName, saveReviewerName } from "@/lib/reviews/reviewer-name";
import { useReviewAction } from "@/lib/queries/reviews";
import {
  NOTE_MAX,
  REVIEW_ACTION_COPY,
  REVIEWER_MAX,
  actionSuccessMessage,
  availableReviewActions,
  buildDecisionBody,
  describeActionError,
  initialConfirmation,
  type ConfirmableAction,
  type DecisionFieldErrors,
  type ReviewAction,
} from "@/lib/reviews/model";
import type { ReviewDecisionBody, ReviewRequestResponse } from "@/types/api";

interface Feedback {
  tone: "success" | "error";
  text: string;
}

/**
 * Start / approve / reject for one review. Only the actions the backend accepts from the current
 * status are offered, and none once the review has expired. Approve and reject ask for confirmation,
 * because they are final, and collect the reviewer's name (remembered for this tab) and a note
 * (required to reject). Both are stored on the review and shown to the agent.
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
  // Review data is fetched in the browser (admin key), so this never renders on the server.
  const [reviewer, setReviewer] = useState(() => loadReviewerName());
  const [note, setNote] = useState("");
  const [fieldErrors, setFieldErrors] = useState<DecisionFieldErrors>({});
  const fieldId = useId();
  const allowed = availableReviewActions(review.status);
  const actions = review.expired ? [] : allowed;

  function openConfirmation(action: ConfirmableAction) {
    setNote("");
    setFieldErrors({});
    setConfirming(action);
  }

  function closeConfirmation() {
    setConfirming(null);
    setFieldErrors({});
    onConfirmHandled?.();
  }

  function submitDecision(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (confirming === null || confirming === "start") return;
    const result = buildDecisionBody(confirming, { reviewer, note });
    if (!result.ok) {
      setFieldErrors(result.errors);
      const firstInvalid = result.errors.reviewer ? `${fieldId}-reviewer` : `${fieldId}-note`;
      document.getElementById(firstInvalid)?.focus();
      return;
    }
    saveReviewerName(result.body.reviewer);
    run(confirming, result.body);
    closeConfirmation();
  }

  function run(action: ReviewAction, decision?: ReviewDecisionBody) {
    const from = review.status;
    setFeedback(null);
    // Toasts are raised by the mutation hook, so they survive unmount. These per-call callbacks
    // only run while this component is mounted, and they show the inline message.
    mutation.mutate(
      { id: review.id, action, from, decision },
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

      {review.expired && allowed.length > 0 ? (
        <p className="text-sm text-muted-foreground">
          This review expired at <time dateTime={review.expiresAt}>{formatTimestamp(review.expiresAt)}</time>. It can no
          longer be started or decided; the agent must send the request again.
        </p>
      ) : actions.length === 0 ? (
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
                onClick={() => (action === "start" ? run(action) : openConfirmation(action))}
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
          if (!open) closeConfirmation();
        }}
      >
        <AlertDialogContent>
          <form onSubmit={submitDecision} noValidate className="flex flex-col gap-4">
            <AlertDialogHeader>
              <AlertDialogTitle>{confirming ? REVIEW_ACTION_COPY[confirming].confirmTitle : ""}</AlertDialogTitle>
              <AlertDialogDescription>
                {confirming ? REVIEW_ACTION_COPY[confirming].confirmBody : ""}
              </AlertDialogDescription>
            </AlertDialogHeader>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`${fieldId}-reviewer`}>Your name</Label>
              <Input
                id={`${fieldId}-reviewer`}
                value={reviewer}
                onChange={(event) => setReviewer(event.target.value)}
                maxLength={REVIEWER_MAX}
                autoComplete="name"
                required
                aria-invalid={fieldErrors.reviewer ? true : undefined}
                aria-describedby={`${fieldId}-reviewer-help`}
              />
              <p id={`${fieldId}-reviewer-help`} className={fieldErrors.reviewer ? "text-xs text-danger-text" : "text-xs text-muted-foreground"}>
                {fieldErrors.reviewer ?? "Stored on the review and shown to the agent. Remembered for this browser tab."}
              </p>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`${fieldId}-note`}>
                Note {confirming === "reject" ? "(required)" : "(optional)"}
              </Label>
              <Textarea
                id={`${fieldId}-note`}
                value={note}
                onChange={(event) => setNote(event.target.value)}
                maxLength={NOTE_MAX}
                rows={3}
                required={confirming === "reject"}
                aria-invalid={fieldErrors.note ? true : undefined}
                aria-describedby={`${fieldId}-note-help`}
              />
              <p id={`${fieldId}-note-help`} className={fieldErrors.note ? "text-xs text-danger-text" : "text-xs text-muted-foreground"}>
                {fieldErrors.note ??
                  (confirming === "reject" ? "Why it was rejected. The agent sees this." : "Shown to the agent with the approval.")}
              </p>
            </div>

            <AlertDialogFooter>
              <AlertDialogCancel type="button">Cancel</AlertDialogCancel>
              <Button type="submit" variant={confirming === "reject" ? "destructive" : "default"} disabled={mutation.isPending}>
                {confirming ? REVIEW_ACTION_COPY[confirming].label : "Confirm"}
              </Button>
            </AlertDialogFooter>
          </form>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
