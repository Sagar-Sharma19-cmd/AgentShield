/**
 * Keyboard model for the Reviews queue. Pure; tested in queue-keys.test.ts.
 *
 * Builds on the Overview triage keys (triageKey): J/K/arrows/Home/End move, Enter opens, and A/R open
 * the existing approve/reject CONFIRMATION, never the action itself. Added here:
 * - S starts the highlighted review (PENDING → IN_REVIEW), the same action as the Start review button.
 * - Expired and already-decided reviews are never actionable; the key explains why instead.
 * - Keys are ignored while the operator types or while a dialog or sheet is open.
 */
import { triageKey, type TriageKeyEvent } from "@/lib/checkpoint/triage";
import { isEffectivelyExpired } from "@/lib/reviews/expiry";
import type { ReviewRequestResponse, ReviewStatus } from "@/types/api";

export type QueueKeyResult =
  | { kind: "move"; index: number }
  | { kind: "open"; reviewId: string }
  | { kind: "confirm"; reviewId: string; action: "approve" | "reject" }
  | { kind: "start"; reviewId: string; status: ReviewStatus }
  | { kind: "explain"; message: string }
  | { kind: "none" };

export interface QueueKeyContext {
  /** Focus is in a text field, select or similar. */
  typing: boolean;
  /** A dialog, sheet or menu is open. */
  dialogOpen: boolean;
  /** Local clock, for the expiry check. */
  now: number;
}

type QueueReview = Pick<ReviewRequestResponse, "id" | "status" | "expired" | "expiresAt">;

const DECIDED_MESSAGE = "This review is already decided. Decisions are final.";
const EXPIRED_MESSAGE = "This review has expired. It can no longer be started or decided.";

export function queueKey(
  event: TriageKeyEvent,
  reviews: readonly QueueReview[],
  activeIndex: number,
  context: QueueKeyContext,
): QueueKeyResult {
  if (context.typing || context.dialogOpen) return { kind: "none" };
  if (event.altKey || event.ctrlKey || event.metaKey || reviews.length === 0) return { kind: "none" };
  const index = Math.min(Math.max(activeIndex, 0), reviews.length - 1);
  const active = reviews[index];
  const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
  const decided = active.status === "APPROVED" || active.status === "REJECTED";
  const expired = isEffectivelyExpired(active, context.now);

  if (key === "s") {
    if (decided) return { kind: "explain", message: DECIDED_MESSAGE };
    if (expired) return { kind: "explain", message: EXPIRED_MESSAGE };
    if (active.status === "IN_REVIEW") {
      return { kind: "explain", message: "This review is already in review. Press A to approve or R to reject, after confirmation." };
    }
    return { kind: "start", reviewId: active.id, status: active.status };
  }

  if (key === "a" || key === "r") {
    if (decided) return { kind: "explain", message: DECIDED_MESSAGE };
    if (expired) return { kind: "explain", message: EXPIRED_MESSAGE };
  }

  const result = triageKey(event, reviews, index);
  switch (result.kind) {
    case "move":
      return result;
    case "open":
      return { kind: "open", reviewId: result.reviewId };
    case "confirm":
      return { kind: "confirm", reviewId: result.reviewId, action: result.action };
    case "needs-start":
      return {
        kind: "explain",
        message: `This review has not been started. Press S to start it; ${result.action} becomes available once it is in review.`,
      };
    case "none":
      return result;
  }
}
