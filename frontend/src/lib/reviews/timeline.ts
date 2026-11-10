/**
 * Review timeline: Created → In review → Decision → Agent claim. Pure; tested in timeline.test.ts.
 *
 * Built only from fields on the review record (status, expired/expiresAt, reviewer, note, reviewedAt,
 * consumedAt, createdAt, updatedAt). Where the record does not hold a time, the step says so instead of
 * inventing one: the backend stores no separate "started at", so the In review step has a time only
 * while the review is IN_REVIEW (then updatedAt is the start, because nothing else changes the row).
 *
 * Step states (each rendered with an icon AND a text label, never colour alone):
 * - done:     happened.
 * - current:  what the review is waiting for now.
 * - upcoming: has not happened yet and still can.
 * - skipped:  will never happen (for example, a rejected review is never claimed).
 * - expired:  the review expired at this step.
 */
import { isEffectivelyExpired } from "@/lib/reviews/expiry";
import type { ReviewRequestResponse } from "@/types/api";

export type TimelineState = "done" | "current" | "upcoming" | "skipped" | "expired";

export type TimelineStepId = "created" | "in-review" | "decision" | "claim";

export interface TimelineStep {
  id: TimelineStepId;
  state: TimelineState;
  title: string;
  /** ISO instant for the step, when the record holds one. */
  at: string | null;
  /** One short sentence of context. */
  detail?: string;
  /** Reviewer's note, verbatim, on the decision step. */
  note?: string;
}

export const TIMELINE_STATE_LABELS: Record<TimelineState, string> = {
  done: "Done",
  current: "Now",
  upcoming: "Not yet",
  skipped: "Will not happen",
  expired: "Expired",
};

export type TimelineInput = Pick<
  ReviewRequestResponse,
  "status" | "expired" | "expiresAt" | "createdAt" | "updatedAt" | "reviewedAt" | "reviewer" | "note" | "consumedAt"
>;

function reviewerName(review: TimelineInput): string {
  return review.reviewer?.trim() || "a reviewer (name not recorded)";
}

function createdStep(review: TimelineInput): TimelineStep {
  return { id: "created", state: "done", title: "Created", at: review.createdAt, detail: "The gateway held the request for review." };
}

function inReviewStep(review: TimelineInput, expired: boolean): TimelineStep {
  switch (review.status) {
    case "PENDING":
      return expired
        ? { id: "in-review", state: "expired", title: "Never started", at: review.expiresAt, detail: "It expired before anyone started it." }
        : { id: "in-review", state: "current", title: "Waiting to be started", at: null, detail: "Start the review to approve or reject it." };
    case "IN_REVIEW":
      return { id: "in-review", state: "done", title: "In review", at: review.updatedAt, detail: "A reviewer started it." };
    case "APPROVED":
    case "REJECTED":
      return { id: "in-review", state: "done", title: "In review", at: null, detail: "The start time is not recorded." };
  }
}

function decisionStep(review: TimelineInput, expired: boolean): TimelineStep {
  switch (review.status) {
    case "APPROVED":
      return {
        id: "decision",
        state: "done",
        title: `Approved by ${reviewerName(review)}`,
        at: review.reviewedAt,
        note: review.note ?? undefined,
      };
    case "REJECTED":
      return {
        id: "decision",
        state: "done",
        title: `Rejected by ${reviewerName(review)}`,
        at: review.reviewedAt,
        note: review.note ?? undefined,
      };
    case "IN_REVIEW":
      return expired
        ? { id: "decision", state: "expired", title: "Expired before a decision", at: review.expiresAt, detail: "It can no longer be approved or rejected." }
        : { id: "decision", state: "current", title: "Awaiting a decision", at: null, detail: "Approve or reject, after confirmation." };
    case "PENDING":
      return expired
        ? { id: "decision", state: "skipped", title: "No decision", at: null, detail: "It expired before a decision." }
        : { id: "decision", state: "upcoming", title: "Approve or reject", at: null };
  }
}

function claimStep(review: TimelineInput, expired: boolean): TimelineStep {
  // A claim is recorded only on an APPROVED review (a database CHECK enforces it). If it is present it
  // happened, and it happened before expiry (the claim is refused after), so it wins over `expired`.
  if (review.status === "APPROVED" && review.consumedAt) {
    return {
      id: "claim",
      state: "done",
      title: "Claimed by the agent",
      at: review.consumedAt,
      detail: "The agent ran this exact operation once. It cannot be claimed again.",
    };
  }
  switch (review.status) {
    case "APPROVED":
      return expired
        ? {
            id: "claim",
            state: "expired",
            title: "Expired before it was claimed",
            at: review.expiresAt,
            detail: "The agent did not claim the approval in time, so it can no longer run this operation.",
          }
        : {
            id: "claim",
            state: "current",
            title: "Not yet claimed",
            at: null,
            detail: "The agent can claim it once, before it expires.",
          };
    case "REJECTED":
      return { id: "claim", state: "skipped", title: "Not claimable", at: null, detail: "Rejected reviews cannot be claimed." };
    case "PENDING":
    case "IN_REVIEW":
      return expired
        ? { id: "claim", state: "skipped", title: "Not claimable", at: null, detail: "It expired before it was approved." }
        : { id: "claim", state: "upcoming", title: "Agent claim", at: null, detail: "Only after an approval, once, before it expires." };
  }
}

/** The four steps in order. `now` is the local clock; a review counts as expired per isEffectivelyExpired. */
export function reviewTimeline(review: TimelineInput, now: number): TimelineStep[] {
  const expired = isEffectivelyExpired(review, now);
  return [createdStep(review), inReviewStep(review, expired), decisionStep(review, expired), claimStep(review, expired)];
}
