import { describe, expect, it } from "vitest";
import type { ReviewStatus } from "@/types/api";
import { queueKey, type QueueKeyContext } from "./queue-keys";

const NOW = Date.parse("2026-11-10T10:10:00Z");
const ctx: QueueKeyContext = { typing: false, dialogOpen: false, now: NOW };
const key = (k: string, mods: Partial<{ altKey: boolean; ctrlKey: boolean; metaKey: boolean }> = {}) => ({
  key: k,
  altKey: false,
  ctrlKey: false,
  metaKey: false,
  ...mods,
});

function review(id: string, status: ReviewStatus, expired = false, expiresAt = "2026-11-10T10:30:00Z") {
  return { id, status, expired, expiresAt };
}

const list = [review("p", "PENDING"), review("i", "IN_REVIEW"), review("a", "APPROVED"), review("x", "PENDING", true)];

describe("queueKey", () => {
  it("moves with J/K, opens with Enter (same as triage)", () => {
    expect(queueKey(key("j"), list, 0, ctx)).toEqual({ kind: "move", index: 1 });
    expect(queueKey(key("K"), list, 1, ctx)).toEqual({ kind: "move", index: 0 });
    expect(queueKey(key("Enter"), list, 2, ctx)).toEqual({ kind: "open", reviewId: "a" });
  });

  it("S starts only a PENDING, unexpired review", () => {
    expect(queueKey(key("s"), list, 0, ctx)).toEqual({ kind: "start", reviewId: "p", status: "PENDING" });
    expect(queueKey(key("s"), list, 1, ctx).kind).toBe("explain");
    expect(queueKey(key("s"), list, 2, ctx).kind).toBe("explain");
    expect(queueKey(key("s"), list, 3, ctx).kind).toBe("explain");
  });

  it("A/R only ask to open the confirmation, and only for IN_REVIEW", () => {
    expect(queueKey(key("a"), list, 1, ctx)).toEqual({ kind: "confirm", reviewId: "i", action: "approve" });
    expect(queueKey(key("R"), list, 1, ctx)).toEqual({ kind: "confirm", reviewId: "i", action: "reject" });
    const pending = queueKey(key("a"), list, 0, ctx);
    expect(pending.kind).toBe("explain");
    if (pending.kind === "explain") expect(pending.message).toMatch(/Press S to start/);
  });

  it("never offers actions on decided or expired reviews", () => {
    expect(queueKey(key("a"), list, 2, ctx)).toMatchObject({ kind: "explain", message: expect.stringMatching(/already decided/) });
    expect(queueKey(key("r"), list, 3, ctx)).toMatchObject({ kind: "explain", message: expect.stringMatching(/expired/) });
    // Past expiresAt by the local clock, before the backend flag refreshes.
    const late = [review("i2", "IN_REVIEW", false, "2026-11-10T10:00:00Z")];
    expect(queueKey(key("a"), late, 0, ctx).kind).toBe("explain");
  });

  it("ignores keys while typing, with a dialog open, or with modifiers", () => {
    expect(queueKey(key("a"), list, 1, { ...ctx, typing: true })).toEqual({ kind: "none" });
    expect(queueKey(key("a"), list, 1, { ...ctx, dialogOpen: true })).toEqual({ kind: "none" });
    expect(queueKey(key("s", { metaKey: true }), list, 0, ctx)).toEqual({ kind: "none" });
    expect(queueKey(key("x"), list, 0, ctx)).toEqual({ kind: "none" });
    expect(queueKey(key("j"), [], 0, ctx)).toEqual({ kind: "none" });
  });
});
