import { z } from "zod";
import { ApiError } from "@/lib/api/client";
import type { AgentResponse, ReviewRequestResponse, ReviewStatus } from "@/types/api";

/**
 * Pure review-workflow rules for the console. They mirror ReviewRequestService: a review starts
 * PENDING, must be started to IN_REVIEW, and then ends APPROVED or REJECTED. Nothing in this
 * module grants tool authorization; approval records a human decision only.
 */

export const REVIEW_STATUSES = ["PENDING", "IN_REVIEW", "APPROVED", "REJECTED"] as const satisfies readonly ReviewStatus[];

export const REVIEW_STATUS_LABELS: Record<ReviewStatus, string> = {
  PENDING: "Pending",
  IN_REVIEW: "In review",
  APPROVED: "Approved",
  REJECTED: "Rejected",
};

export type ReviewAction = "start" | "approve" | "reject";

/** Actions the backend will accept from each status. Terminal statuses accept none. */
export function availableReviewActions(status: ReviewStatus): ReviewAction[] {
  switch (status) {
    case "PENDING":
      return ["start"];
    case "IN_REVIEW":
      return ["approve", "reject"];
    case "APPROVED":
    case "REJECTED":
      return [];
  }
}

/** Copy shown for each action. Every confirmation states what the action does not do. */
export const REVIEW_ACTION_COPY: Record<
  ReviewAction,
  { label: string; confirmTitle?: string; confirmBody?: string; success: string }
> = {
  start: {
    label: "Start review",
    success: "Review started. It is now in review.",
  },
  approve: {
    label: "Approve",
    confirmTitle: "Approve this review?",
    confirmBody:
      "This records a human approval for the held request. It does not grant the agent permission to use this tool, does not re-run the request, and does not change future gateway decisions.",
    success: "Review approved. This records the decision only and grants no tool permission.",
  },
  reject: {
    label: "Reject",
    confirmTitle: "Reject this review?",
    confirmBody:
      "This records a rejection of the held request. It does not change any gateway decision or permission grant.",
    success: "Review rejected. This records the decision only.",
  },
};

/** Newest first by creation time. The backend returns review lists unordered, so this is applied client-side. */
export function sortNewestFirst<T extends Pick<ReviewRequestResponse, "createdAt">>(reviews: readonly T[]): T[] {
  return [...reviews].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

/** URL state for the Reviews page. Unknown values fall back to the safe defaults (PENDING, no selection). */
const reviewUrlSchema = z.object({
  status: z.enum(REVIEW_STATUSES).catch("PENDING"),
  review: z.uuid().optional().catch(undefined),
});

export type ReviewUrlState = z.infer<typeof reviewUrlSchema>;

export function parseReviewParams(raw: Record<string, string | string[] | undefined>): ReviewUrlState {
  const flat: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(raw)) {
    flat[key] = Array.isArray(value) ? value[0] : value;
  }
  return reviewUrlSchema.parse(flat);
}

/** Builds a /reviews href. The selection is dropped when the status changes or the sheet closes. */
export function buildReviewHref(state: { status: ReviewStatus; review?: string }): string {
  const params = new URLSearchParams({ status: state.status });
  if (state.review) params.set("review", state.review);
  return `/reviews?${params.toString()}`;
}

/** Status word for the success message of an action, used for the transition feedback line. */
export function transitionLabel(from: ReviewStatus, to: ReviewStatus): string {
  return `${REVIEW_STATUS_LABELS[from]} → ${REVIEW_STATUS_LABELS[to]}`;
}

/** Success text shared by the inline feedback and the toast, so both always say the same thing. */
export function actionSuccessMessage(action: ReviewAction, from: ReviewStatus, to: ReviewStatus): string {
  return `${transitionLabel(from, to)}. ${REVIEW_ACTION_COPY[action].success}`;
}

/**
 * State of the agent registry request. `ready` means the request succeeded, so an absent agent is
 * a confirmed fact. `loading` and `error` mean absence is unknown and must not be reported as such.
 */
export type AgentLookup =
  | { state: "loading" }
  | { state: "error" }
  | { state: "ready"; agents: readonly AgentResponse[] };

export type AgentResolution =
  | { kind: "loading" }
  | { kind: "error" }
  | { kind: "absent" }
  | { kind: "found"; agent: AgentResponse };

export function resolveAgent(lookup: AgentLookup, agentId: string): AgentResolution {
  if (lookup.state === "loading") return { kind: "loading" };
  if (lookup.state === "error") return { kind: "error" };
  const agent = lookup.agents.find((item) => item.id === agentId);
  return agent ? { kind: "found", agent } : { kind: "absent" };
}

/** Maps backend failures to plain language. The refused-transition text is the backend's own message. */
export function describeActionError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 400) {
      return `${error.message} The review has been refreshed; check its current status.`;
    }
    if (error.status === 401 || error.status === 403) {
      return "AgentShield rejected the admin key. Lock the console and unlock it again.";
    }
    if (error.status === 404) {
      return "This review no longer exists.";
    }
    return error.message;
  }
  return "The decision could not be saved. Check that the AgentShield backend is running, then try again.";
}
