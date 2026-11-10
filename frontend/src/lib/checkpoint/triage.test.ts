import { describe, expect, it } from "vitest";
import { clampIndex, openReviews, triageKey, type TriageKeyEvent } from "./triage";

const press = (key: string, mods: Partial<TriageKeyEvent> = {}): TriageKeyEvent => ({
  key,
  altKey: false,
  ctrlKey: false,
  metaKey: false,
  ...mods,
});

const reviews = [
  { id: "a", status: "IN_REVIEW" as const },
  { id: "b", status: "PENDING" as const },
  { id: "c", status: "IN_REVIEW" as const },
];

describe("clampIndex", () => {
  it("clamps to the list and handles empty lists", () => {
    expect(clampIndex(0, -1, 3)).toBe(0);
    expect(clampIndex(2, 1, 3)).toBe(2);
    expect(clampIndex(1, 1, 3)).toBe(2);
    expect(clampIndex(5, 0, 0)).toBe(0);
  });
});

describe("triageKey", () => {
  it("moves with J/K and arrows without wrapping", () => {
    expect(triageKey(press("j"), reviews, 0)).toEqual({ kind: "move", index: 1 });
    expect(triageKey(press("J"), reviews, 2)).toEqual({ kind: "move", index: 2 });
    expect(triageKey(press("k"), reviews, 0)).toEqual({ kind: "move", index: 0 });
    expect(triageKey(press("ArrowDown"), reviews, 1)).toEqual({ kind: "move", index: 2 });
    expect(triageKey(press("ArrowUp"), reviews, 1)).toEqual({ kind: "move", index: 0 });
    expect(triageKey(press("Home"), reviews, 2)).toEqual({ kind: "move", index: 0 });
    expect(triageKey(press("End"), reviews, 0)).toEqual({ kind: "move", index: 2 });
  });

  it("opens the active review with Enter", () => {
    expect(triageKey(press("Enter"), reviews, 1)).toEqual({ kind: "open", reviewId: "b", status: "PENDING" });
  });

  it("asks for confirmation for A/R on an in-review item, never acting directly", () => {
    expect(triageKey(press("a"), reviews, 0)).toEqual({ kind: "confirm", reviewId: "a", status: "IN_REVIEW", action: "approve" });
    expect(triageKey(press("R"), reviews, 2)).toEqual({ kind: "confirm", reviewId: "c", status: "IN_REVIEW", action: "reject" });
  });

  it("explains that a pending review must be started before A/R", () => {
    expect(triageKey(press("a"), reviews, 1)).toEqual({ kind: "needs-start", action: "approve" });
    expect(triageKey(press("r"), reviews, 1)).toEqual({ kind: "needs-start", action: "reject" });
  });

  it("ignores modified keys, unknown keys and empty lists", () => {
    expect(triageKey(press("k", { metaKey: true }), reviews, 1)).toEqual({ kind: "none" });
    expect(triageKey(press("a", { ctrlKey: true }), reviews, 0)).toEqual({ kind: "none" });
    expect(triageKey(press("j", { altKey: true }), reviews, 0)).toEqual({ kind: "none" });
    expect(triageKey(press("x"), reviews, 0)).toEqual({ kind: "none" });
    expect(triageKey(press("Enter"), [], 0)).toEqual({ kind: "none" });
  });

  it("clamps a stale active index after the list shrank", () => {
    expect(triageKey(press("Enter"), reviews, 9)).toEqual({ kind: "open", reviewId: "c", status: "IN_REVIEW" });
  });
});

describe("openReviews", () => {
  it("merges both lists newest first without duplicates", () => {
    const pending = [
      { id: "p1", createdAt: "2026-11-10T10:00:00Z" },
      { id: "both", createdAt: "2026-11-10T12:00:00Z" },
    ];
    const inReview = [
      { id: "i1", createdAt: "2026-11-10T11:00:00Z" },
      { id: "both", createdAt: "2026-11-10T12:00:00Z" },
    ];
    expect(openReviews(pending, inReview).map((review) => review.id)).toEqual(["both", "i1", "p1"]);
  });

  it("handles missing lists", () => {
    expect(openReviews(undefined, undefined)).toEqual([]);
    expect(openReviews([{ id: "p", createdAt: "2026-11-10T10:00:00Z" }], undefined).map((review) => review.id)).toEqual(["p"]);
  });
});
