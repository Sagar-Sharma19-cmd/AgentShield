import { describe, expect, it } from "vitest";
import type { ReviewStatus } from "@/types/api";
import { buildWorkspaceHref, needsAction, needsActionCount, parseWorkspaceParams, partitionReviews, tabCounts, tabFor } from "./tabs";

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

describe("needsAction and the sidebar badge (needsActionCount)", () => {
  // Expiry is derived from expiresAt and never stored: an expired review keeps status PENDING, and between polls
  // the backend's expired flag can still say false.
  const BEFORE = Date.parse("2026-11-10T10:20:00Z");
  const AFTER = Date.parse("2026-11-10T10:40:00Z");

  it("counts only open reviews whose expiresAt is later than now", () => {
    const lists = {
      PENDING: [
        row("live", "PENDING", false, "2026-11-10T10:00:00Z", "2026-11-10T11:00:00Z"),
        row("stale", "PENDING", false, "2026-11-10T09:00:00Z", "2026-11-10T09:30:00Z"),
        row("flagged", "PENDING", true, "2026-11-10T10:00:00Z", "2026-11-10T11:00:00Z"),
      ],
      IN_REVIEW: [row("working", "IN_REVIEW", false, "2026-11-10T10:00:00Z", "2026-11-10T11:00:00Z")],
    };
    expect(needsActionCount(lists, BEFORE)).toBe(2);
  });

  it("drops an expired PENDING row whose flag still says false, as soon as the clock passes expiresAt", () => {
    const lists = { PENDING: [row("p", "PENDING", false, "2026-11-10T10:00:00Z", "2026-11-10T10:30:00Z")], IN_REVIEW: [] };
    expect(needsActionCount(lists, BEFORE)).toBe(1);
    expect(needsActionCount(lists, AFTER)).toBe(0);
    expect(needsActionCount(lists, Date.parse("2026-11-10T10:30:00Z"))).toBe(0);
  });

  it("is exactly the Needs action tab at the same instant", () => {
    const lists = {
      PENDING: [row("a", "PENDING", false, "2026-11-10T10:00:00Z", "2026-11-10T10:30:00Z"), row("b", "PENDING")],
      IN_REVIEW: [row("c", "IN_REVIEW", false, "2026-11-10T10:00:00Z", "2026-11-10T12:00:00Z")],
    };
    for (const now of [BEFORE, AFTER]) {
      expect(needsActionCount(lists, now)).toBe(partitionReviews(lists, now)["needs-action"]?.length);
    }
    expect(partitionReviews(lists, AFTER).expired?.map((r) => r.id).sort()).toEqual(["a", "b"]);
  });

  it("counts a review in both lists once, and is unknown until both lists load", () => {
    const moved = row("m", "IN_REVIEW", false, "2026-11-10T10:00:00Z", "2026-11-10T11:00:00Z");
    expect(needsActionCount({ PENDING: [{ ...moved, status: "PENDING" as const }], IN_REVIEW: [moved] }, BEFORE)).toBe(1);
    expect(needsActionCount({ PENDING: [row("p", "PENDING")] }, BEFORE)).toBeUndefined();
  });

  it("needsAction: decided reviews never need action; without a clock the backend flag decides", () => {
    expect(needsAction(row("a", "APPROVED"), BEFORE)).toBe(false);
    expect(needsAction(row("r", "REJECTED"), BEFORE)).toBe(false);
    expect(needsAction(row("p", "PENDING", false, "2026-11-10T09:00:00Z", "2026-11-10T09:30:00Z"))).toBe(true);
    expect(tabFor(row("p", "PENDING", false, "2026-11-10T09:00:00Z", "2026-11-10T09:30:00Z"), AFTER)).toBe("expired");
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
