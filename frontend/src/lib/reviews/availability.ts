/**
 * Which action buttons the review detail shows, and why a shown button is disabled. Pure; tested in
 * availability.test.ts. Mirrors availableReviewActions (the backend state machine) and never enables
 * anything it does not allow; it only adds explanations for what is not available.
 */
import { expiredReason } from "@/lib/reviews/expiry";
import { availableReviewActions, type ReviewAction } from "@/lib/reviews/model";
import type { ReviewRequestResponse } from "@/types/api";

export interface ActionAvailability {
  action: ReviewAction;
  enabled: boolean;
  /** Why it is disabled. Present exactly when enabled is false. */
  reason?: string;
}

export const START_FIRST_REASON = "Start the review first. Approve and reject become available once it is in review.";

export function actionAvailability(
  review: Pick<ReviewRequestResponse, "status" | "expired" | "expiresAt">,
  now: number,
): ActionAvailability[] {
  if (review.status === "APPROVED" || review.status === "REJECTED") return [];
  const expired = expiredReason(review, now);
  const allowed = new Set(availableReviewActions(review.status));
  const shown: ReviewAction[] = review.status === "PENDING" ? ["start", "approve", "reject"] : ["approve", "reject"];

  return shown.map((action) => {
    if (expired) return { action, enabled: false, reason: expired };
    if (allowed.has(action)) return { action, enabled: true };
    return { action, enabled: false, reason: START_FIRST_REASON };
  });
}
