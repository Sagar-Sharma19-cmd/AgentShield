import { describe, expect, it } from "vitest";
import type { ReviewStatus } from "@/types/api";
import { buildWorkspaceHref, parseWorkspaceParams, partitionReviews, tabCounts, tabFor } from "./tabs";

const ID = "11111111-2222-4333-8444-555555555555";

function row(id: string, status: ReviewStatus, expired = false, createdAt = "2026-11-10T10:00:00Z", expiresAt = "2026-11-10T10:30:00Z") {
  return { id, status, expired, createdAt, expiresAt };
}

describe("tabFor", () => {
  it("puts open reviews on Needs action unless the backend says they expired", () => {
    expect(tabFor(row("a", "PENDING"))).toBe("needs-action");
    expect(tabFor(row("a", "IN_REVIEW"))).toBe("needs-action");
    expect(tabFor(row("a", "PENDING", true))).toBe("expired");
    expect(tabFor(row("a", "IN_REVIEW", true))).toBe("expired");
  });

  it("keeps decided reviews on their status tab even once expired", () => {
    expect(tabFor(row("a", "APPROVED", true))).toBe("approved");
    expect(tabFor(row("a", "REJECTED", true))).toBe("rejected");
  });
});

describe("partitionReviews", () => {
  it("splits the lists into tabs, Needs action by soonest expiry, others newest first", () => {
    const tabs = partitionReviews({
      PENDING: [row("p1", "PENDING", false, "2026-11-10T10:05:00Z", "2026-11-10T10:35:00Z"), row("p2", "PENDING", true)],
      IN_REVIEW: [row("i1", "IN_REVIEW", false, "2026-11-10T10:01:00Z", "2026-11-10T10:31:00Z")],
      APPROVED: [row("a1", "APPROVED", false, "2026-11-10T09:00:00Z"), row("a2", "APPROVED", true, "2026-11-10T09:30:00Z")],
      REJECTED: [],
    });
    expect(tabs["needs-action"]?.map((r) => r.id)).toEqual(["i1", "p1"]);
    expect(tabs.expired?.map((r) => r.id)).toEqual(["p2"]);
    expect(tabs.approved?.map((r) => r.id)).toEqual(["a2", "a1"]);
    expect(tabs.rejected).toEqual([]);
  });

  it("leaves a tab unknown until all of its lists have loaded", () => {
    const tabs = partitionReviews({ PENDING: [row("p1", "PENDING")], APPROVED: [] });
    expect(tabs["needs-action"]).toBeUndefined();
    expect(tabs.expired).toBeUndefined();
    expect(tabs.approved).toEqual([]);
    expect(tabs.rejected).toBeUndefined();
    expect(tabCounts(tabs)).toEqual({ "needs-action": undefined, approved: 0, rejected: undefined, expired: undefined });
  });

  it("keeps the later state when a review appears in two lists during a transition", () => {
    const tabs = partitionReviews({ PENDING: [row("x", "PENDING")], IN_REVIEW: [], APPROVED: [row("x", "APPROVED")], REJECTED: [] });
    expect(tabs["needs-action"]).toEqual([]);
    expect(tabs.approved?.map((r) => r.id)).toEqual(["x"]);
  });
});

describe("parseWorkspaceParams", () => {
  it("defaults to Needs action", () => {
    expect(parseWorkspaceParams({})).toEqual({ tab: "needs-action" });
  });

  it("reads tab, review and confirm", () => {
    expect(parseWorkspaceParams({ tab: "expired", review: ID })).toEqual({ tab: "expired", review: ID });
    expect(parseWorkspaceParams({ tab: "needs-action", review: ID, confirm: "approve" })).toEqual({
      tab: "needs-action",
      review: ID,
      confirm: "approve",
    });
  });

  it("maps legacy ?status= links (Overview triage) to their tab", () => {
    expect(parseWorkspaceParams({ status: "IN_REVIEW", review: ID, confirm: "reject" })).toEqual({
      tab: "needs-action",
      review: ID,
      confirm: "reject",
    });
    expect(parseWorkspaceParams({ status: "APPROVED" })).toEqual({ tab: "approved" });
    expect(parseWorkspaceParams({ status: "REJECTED" })).toEqual({ tab: "rejected" });
  });

  it("falls back safely on unknown values and never keeps confirm without a review or for start", () => {
    expect(parseWorkspaceParams({ tab: "approve-all", status: "nope" })).toEqual({ tab: "needs-action" });
    expect(parseWorkspaceParams({ tab: "approved", confirm: "approve" })).toEqual({ tab: "approved" });
    expect(parseWorkspaceParams({ tab: "needs-action", review: ID, confirm: "start" })).toEqual({ tab: "needs-action", review: ID });
    expect(parseWorkspaceParams({ tab: "needs-action", review: "not-a-uuid" })).toEqual({ tab: "needs-action" });
  });
});

describe("buildWorkspaceHref", () => {
  it("round-trips through parseWorkspaceParams", () => {
    const state = { tab: "needs-action" as const, review: ID, confirm: "approve" as const };
    const href = buildWorkspaceHref(state);
    expect(href).toBe(`/reviews?tab=needs-action&review=${ID}&confirm=approve`);
    const params = Object.fromEntries(new URL(href, "http://x").searchParams);
    expect(parseWorkspaceParams(params)).toEqual(state);
  });

  it("drops confirm without a review", () => {
    expect(buildWorkspaceHref({ tab: "approved", confirm: "reject" })).toBe("/reviews?tab=approved");
  });
});
