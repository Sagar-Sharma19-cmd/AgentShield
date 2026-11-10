/**
 * Keyboard model for the Overview's ReviewTriage list. Pure; tested in triage.test.ts.
 *
 * Keys never change a review on their own. Enter opens the review on the Reviews page. A and R
 * open the existing approve/reject confirmation there, and only when the backend would accept
 * that action (IN_REVIEW). A PENDING review must be started first, so A/R only explain that.
 */
import { availableReviewActions } from "@/lib/reviews/model";
import type { ReviewRequestResponse, ReviewStatus } from "@/types/api";

export type TriageKeyResult =
  | { kind: "move"; index: number }
  | { kind: "open"; reviewId: string; status: ReviewStatus }
  | { kind: "confirm"; reviewId: string; status: ReviewStatus; action: "approve" | "reject" }
  | { kind: "needs-start"; action: "approve" | "reject" }
  | { kind: "none" };

export interface TriageKeyEvent {
  key: string;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
}

/** Index after moving by `delta`, clamped to the list (no wrap, so J at the bottom stays put). */
export function clampIndex(index: number, delta: number, length: number): number {
  if (length <= 0) return 0;
  return Math.min(length - 1, Math.max(0, index + delta));
}

/**
 * What a key press on the triage list should do. Modified keys (Ctrl/⌘/Alt) are ignored so browser
 * and palette shortcuts keep working; Shift is allowed because A/R are case-insensitive.
 */
export function triageKey(
  event: TriageKeyEvent,
  reviews: readonly Pick<ReviewRequestResponse, "id" | "status">[],
  activeIndex: number,
): TriageKeyResult {
  if (event.altKey || event.ctrlKey || event.metaKey || reviews.length === 0) return { kind: "none" };
  const index = clampIndex(activeIndex, 0, reviews.length);
  const active = reviews[index];
  const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;

  switch (key) {
    case "j":
    case "ArrowDown":
      return { kind: "move", index: clampIndex(index, 1, reviews.length) };
    case "k":
    case "ArrowUp":
      return { kind: "move", index: clampIndex(index, -1, reviews.length) };
    case "Home":
      return { kind: "move", index: 0 };
    case "End":
      return { kind: "move", index: reviews.length - 1 };
    case "Enter":
      return { kind: "open", reviewId: active.id, status: active.status };
    case "a":
    case "r": {
      const action = key === "a" ? "approve" : "reject";
      return availableReviewActions(active.status).includes(action)
        ? { kind: "confirm", reviewId: active.id, status: active.status, action }
        : { kind: "needs-start", action };
    }
    default:
      return { kind: "none" };
  }
}

/** Open reviews (PENDING and IN_REVIEW) merged newest first, without duplicates. */
export function openReviews<T extends Pick<ReviewRequestResponse, "id" | "createdAt">>(
  pending: readonly T[] | undefined,
  inReview: readonly T[] | undefined,
): T[] {
  const byId = new Map<string, T>();
  for (const review of [...(inReview ?? []), ...(pending ?? [])]) byId.set(review.id, review);
  return [...byId.values()].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}
