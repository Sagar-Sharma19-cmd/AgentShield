import { z } from "zod";
import { resolveAgent } from "@/lib/agents/resolve";
import { ApiError } from "@/lib/api/client";
import type { AgentResponse, ReviewDecisionBody, ReviewRequestResponse, ReviewStatus } from "@/types/api";

/**
 * Pure review-workflow rules for the console. They mirror ReviewRequestService: a review starts
 * PENDING, must be started to IN_REVIEW, and then ends APPROVED or REJECTED. Nothing in this
 * module grants tool authorization. An approval lets the owning agent claim and run that exact
 * operation once, before the review expires; the backend enforces that, not the console.
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
      "The agent that made this request can then claim the approval once, before it expires, to run exactly this tool, action and resource. It grants no standing permission and does not change future gateway decisions.",
    success: "Review approved. The agent can claim it once to run exactly this request.",
  },
  reject: {
    label: "Reject",
    confirmTitle: "Reject this review?",
    confirmBody:
      "The agent is told the request was rejected, with your name and note. It does not change any permission grant or future gateway decision.",
    success: "Review rejected. The agent will see your note.",
  },
};

/** Newest first by creation time. The backend returns review lists unordered, so this is applied client-side. */
export function sortNewestFirst<T extends Pick<ReviewRequestResponse, "createdAt">>(reviews: readonly T[]): T[] {
  return [...reviews].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

/** Final actions that a link may ask to confirm (Overview triage A/R). Never "start", which has no confirmation. */
export const CONFIRMABLE_ACTIONS = ["approve", "reject"] as const;
export type ConfirmableAction = (typeof CONFIRMABLE_ACTIONS)[number];

/**
 * URL state for the Reviews page. Unknown values fall back to the safe defaults (PENDING, no selection).
 * `confirm` only pre-opens the existing confirmation dialog for the selected review; it never performs
 * the action, and it is ignored unless the review's current status allows that action.
 */
const reviewUrlSchema = z.object({
  status: z.enum(REVIEW_STATUSES).catch("PENDING"),
  review: z.uuid().optional().catch(undefined),
  confirm: z.enum(CONFIRMABLE_ACTIONS).optional().catch(undefined),
});

export type ReviewUrlState = z.infer<typeof reviewUrlSchema>;

export function parseReviewParams(raw: Record<string, string | string[] | undefined>): ReviewUrlState {
  const flat: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(raw)) {
    flat[key] = Array.isArray(value) ? value[0] : value;
  }
  const parsed = reviewUrlSchema.parse(flat);
  // A confirmation request without a selected review has nothing to confirm.
  return parsed.review ? parsed : { status: parsed.status };
}

/** Builds a /reviews href. The selection is dropped when the status changes or the sheet closes. */
export function buildReviewHref(state: { status: ReviewStatus; review?: string; confirm?: ConfirmableAction }): string {
  const params = new URLSearchParams({ status: state.status });
  if (state.review) {
    params.set("review", state.review);
    if (state.confirm) params.set("confirm", state.confirm);
  }
  return `/reviews?${params.toString()}`;
}

/** The confirmation to pre-open, if the requested action is one the review's status allows. */
export function initialConfirmation(status: ReviewStatus, requested: ConfirmableAction | undefined): ConfirmableAction | null {
  if (!requested) return null;
  return availableReviewActions(status).includes(requested) ? requested : null;
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

/** Resolves a review's agentId (a UUID or the agent's name) against the registry state (lib/agents/resolve.ts). */
export function resolveAgentLookup(lookup: AgentLookup, agentIdOrName: string): AgentResolution {
  if (lookup.state === "loading") return { kind: "loading" };
  if (lookup.state === "error") return { kind: "error" };
  const agent = resolveAgent(agentIdOrName, lookup.agents);
  return agent ? { kind: "found", agent } : { kind: "absent" };
}

/**
 * What the grant section may request. Only a resolved registry UUID is ever sent to the grants endpoint; an
 * unresolved agent (absent, or the registry not loaded) gets a calm note instead of a failing request.
 */
export type GrantRequest =
  | { kind: "fetch"; agentId: string }
  | { kind: "waiting" }
  | { kind: "skip"; note: string };

export function grantRequestFor(agent: AgentResolution): GrantRequest {
  switch (agent.kind) {
    case "found":
      return { kind: "fetch", agentId: agent.agent.id };
    case "loading":
      return { kind: "waiting" };
    case "error":
      return { kind: "skip", note: "Grants cannot be shown until the agent registry loads." };
    case "absent":
      return {
        kind: "skip",
        note: "This agent is not in the agent registry, so there are no grants to show.",
      };
  }
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
    if (error.status === 409) {
      // For example an expired review. The backend message says which.
      return `${error.message} The review has been refreshed.`;
    }
    return error.message;
  }
  return "The decision could not be saved. Check that the AgentShield backend is running, then try again.";
}

/* ---------------------------------------------------------------------------------------------- */
/* Decision body (approve / reject)                                                                */
/* ---------------------------------------------------------------------------------------------- */

/** Limits enforced by the backend (ApproveReviewRequest / RejectReviewRequest). */
export const REVIEWER_MAX = 100;
export const NOTE_MAX = 1000;

export interface DecisionDraft {
  reviewer: string;
  note: string;
}

export type DecisionFieldErrors = Partial<Record<keyof DecisionDraft, string>>;

export type DecisionBodyResult =
  | { ok: true; body: ReviewDecisionBody }
  | { ok: false; errors: DecisionFieldErrors };

/**
 * Validates the dialog fields and builds the request body, mirroring the backend rules: reviewer is
 * required (1-100 characters after trimming); the note is required for reject and optional for
 * approve (at most 1000). An empty optional note is left out of the body.
 */
export function buildDecisionBody(action: ConfirmableAction, draft: DecisionDraft): DecisionBodyResult {
  const reviewer = draft.reviewer.trim();
  const note = draft.note.trim();
  const errors: DecisionFieldErrors = {};

  if (reviewer === "") errors.reviewer = "Enter your name.";
  else if (reviewer.length > REVIEWER_MAX) errors.reviewer = `Use at most ${REVIEWER_MAX} characters.`;

  if (action === "reject" && note === "") errors.note = "Say why you are rejecting it. The agent sees this note.";
  else if (note.length > NOTE_MAX) errors.note = `Use at most ${NOTE_MAX} characters.`;

  if (errors.reviewer || errors.note) return { ok: false, errors };
  return { ok: true, body: note === "" ? { reviewer } : { reviewer, note } };
}
