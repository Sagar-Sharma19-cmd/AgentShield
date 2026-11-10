/**
 * Status tabs and URL state for the Reviews workspace. Pure; tested in tabs.test.ts.
 *
 * Tabs are built from the four existing list queries (GET /reviews?status=…), never a new endpoint:
 * - Needs action: PENDING and IN_REVIEW reviews whose backend `expired` flag is false.
 * - Approved / Rejected: every review in that status. The backend's `expired` flag also becomes true on
 *   decided reviews once expiresAt passes, so it does not move them; the timeline shows what it means.
 * - Expired: PENDING and IN_REVIEW reviews whose backend `expired` flag is true. They timed out before a
 *   decision and are never offered as actionable.
 */
import { z } from "zod";
import { CONFIRMABLE_ACTIONS, parseReviewParams, type ConfirmableAction } from "@/lib/reviews/model";
import type { ReviewRequestResponse, ReviewStatus } from "@/types/api";

export const REVIEW_TABS = ["needs-action", "approved", "rejected", "expired"] as const;
export type ReviewTab = (typeof REVIEW_TABS)[number];

export const REVIEW_TAB_LABELS: Record<ReviewTab, string> = {
  "needs-action": "Needs action",
  approved: "Approved",
  rejected: "Rejected",
  expired: "Expired",
};

/** The list queries each tab reads. Needs action and Expired share the two open statuses. */
export const TAB_STATUSES: Record<ReviewTab, readonly ReviewStatus[]> = {
  "needs-action": ["PENDING", "IN_REVIEW"],
  approved: ["APPROVED"],
  rejected: ["REJECTED"],
  expired: ["PENDING", "IN_REVIEW"],
};

const OPEN_STATUSES: ReadonlySet<ReviewStatus> = new Set(["PENDING", "IN_REVIEW"]);

/** The tab a review belongs on, by the backend's status and expired flag. */
export function tabFor(review: Pick<ReviewRequestResponse, "status" | "expired">): ReviewTab {
  if (OPEN_STATUSES.has(review.status)) return review.expired ? "expired" : "needs-action";
  return review.status === "APPROVED" ? "approved" : "rejected";
}

/** Default tab for a legacy `?status=` link (Overview triage, older bookmarks). */
export function tabForStatus(status: ReviewStatus): ReviewTab {
  switch (status) {
    case "PENDING":
    case "IN_REVIEW":
      return "needs-action";
    case "APPROVED":
      return "approved";
    case "REJECTED":
      return "rejected";
  }
}

type Review = Pick<ReviewRequestResponse, "id" | "status" | "expired" | "createdAt" | "expiresAt">;

/**
 * Splits the four status lists into tabs. A tab whose source lists have not all loaded is undefined
 * (unknown), never an empty array. Duplicates (a review that changed status between two list fetches)
 * keep the copy from the later status in the state machine, which is the newer state.
 *
 * Order: Needs action by expiry, soonest first (the most urgent on top). The others newest first.
 */
export function partitionReviews<T extends Review>(
  lists: Partial<Record<ReviewStatus, readonly T[] | undefined>>,
): Record<ReviewTab, T[] | undefined> {
  const byId = new Map<string, T>();
  for (const status of ["PENDING", "IN_REVIEW", "APPROVED", "REJECTED"] as const) {
    for (const review of lists[status] ?? []) byId.set(review.id, review);
  }
  const all = [...byId.values()];
  const loaded = (tab: ReviewTab) => TAB_STATUSES[tab].every((status) => lists[status] !== undefined);
  const newestFirst = (a: T, b: T) => Date.parse(b.createdAt) - Date.parse(a.createdAt);
  const soonestFirst = (a: T, b: T) => Date.parse(a.expiresAt) - Date.parse(b.expiresAt);

  const result = {} as Record<ReviewTab, T[] | undefined>;
  for (const tab of REVIEW_TABS) {
    if (!loaded(tab)) {
      result[tab] = undefined;
      continue;
    }
    const rows = all.filter((review) => tabFor(review) === tab);
    result[tab] = rows.sort(tab === "needs-action" ? soonestFirst : newestFirst);
  }
  return result;
}

/** Counts for the tab labels. Undefined while unknown, so the UI shows a dash instead of a false 0. */
export function tabCounts(tabs: Record<ReviewTab, readonly unknown[] | undefined>): Record<ReviewTab, number | undefined> {
  return Object.fromEntries(REVIEW_TABS.map((tab) => [tab, tabs[tab]?.length])) as Record<ReviewTab, number | undefined>;
}

/* ---------------------------------------------------------------------------------------------- */
/* URL state                                                                                       */
/* ---------------------------------------------------------------------------------------------- */

export interface ReviewWorkspaceState {
  tab: ReviewTab;
  review?: string;
  /** Pre-opens the existing confirmation dialog only. Never performs the action. */
  confirm?: ConfirmableAction;
}

const tabSchema = z.enum(REVIEW_TABS);

/**
 * `?tab=` wins. Without it, a legacy `?status=` link maps to its tab (so Overview triage links keep
 * working), and anything unknown falls back to Needs action. Review id and confirm rules are the
 * existing ones from parseReviewParams (uuid only; confirm only with a review; approve/reject only).
 */
export function parseWorkspaceParams(raw: Record<string, string | string[] | undefined>): ReviewWorkspaceState {
  const legacy = parseReviewParams(raw);
  const rawTab = Array.isArray(raw.tab) ? raw.tab[0] : raw.tab;
  const parsedTab = tabSchema.safeParse(rawTab);
  const tab = parsedTab.success ? parsedTab.data : tabForStatus(legacy.status);
  const state: ReviewWorkspaceState = { tab };
  if (legacy.review) {
    state.review = legacy.review;
    if (legacy.confirm) state.confirm = legacy.confirm;
  }
  return state;
}

export function buildWorkspaceHref(state: ReviewWorkspaceState): string {
  const params = new URLSearchParams({ tab: state.tab });
  if (state.review) {
    params.set("review", state.review);
    if (state.confirm && (CONFIRMABLE_ACTIONS as readonly string[]).includes(state.confirm)) {
      params.set("confirm", state.confirm);
    }
  }
  return `/reviews?${params.toString()}`;
}
