import { describe, expect, it } from "vitest";
import type { ReviewStatus } from "@/types/api";
import { reviewTimeline, type TimelineInput, type TimelineState } from "./timeline";

const CREATED = "2026-11-10T10:00:00Z";
const EXPIRES = "2026-11-10T10:30:00Z";
const BEFORE_EXPIRY = Date.parse("2026-11-10T10:10:00Z");
const AFTER_EXPIRY = Date.parse("2026-11-10T11:00:00Z");

function review(overrides: Partial<TimelineInput> = {}): TimelineInput {
  return {
    status: "PENDING",
    expired: false,
    expiresAt: EXPIRES,
    createdAt: CREATED,
    updatedAt: CREATED,
    reviewedAt: null,
    reviewer: null,
    note: null,
    consumedAt: null,
    ...overrides,
  };
}

function states(input: TimelineInput, now: number): TimelineState[] {
  return reviewTimeline(input, now).map((step) => step.state);
}

describe("reviewTimeline", () => {
  it("always has the four steps in order, with Created done at createdAt", () => {
    const steps = reviewTimeline(review(), BEFORE_EXPIRY);
    expect(steps.map((step) => step.id)).toEqual(["created", "in-review", "decision", "claim"]);
    expect(steps[0]).toMatchObject({ state: "done", at: CREATED });
  });

  it("PENDING, not expired: waiting to be started; decision and claim still upcoming", () => {
    const steps = reviewTimeline(review(), BEFORE_EXPIRY);
    expect(states(review(), BEFORE_EXPIRY)).toEqual(["done", "current", "upcoming", "upcoming"]);
    expect(steps[1].title).toBe("Waiting to be started");
  });

  it("PENDING, expired (backend flag): never started, no decision, not claimable", () => {
    const input = review({ expired: true });
    const steps = reviewTimeline(input, BEFORE_EXPIRY);
    expect(states(input, BEFORE_EXPIRY)).toEqual(["done", "expired", "skipped", "skipped"]);
    expect(steps[1]).toMatchObject({ title: "Never started", at: EXPIRES });
  });

  it("PENDING past expiresAt by the local clock counts as expired even before the flag updates", () => {
    expect(states(review(), AFTER_EXPIRY)).toEqual(["done", "expired", "skipped", "skipped"]);
  });

  it("IN_REVIEW, not expired: started at updatedAt, awaiting a decision", () => {
    const input = review({ status: "IN_REVIEW", updatedAt: "2026-11-10T10:05:00Z" });
    const steps = reviewTimeline(input, BEFORE_EXPIRY);
    expect(states(input, BEFORE_EXPIRY)).toEqual(["done", "done", "current", "upcoming"]);
    expect(steps[1].at).toBe("2026-11-10T10:05:00Z");
    expect(steps[2].title).toBe("Awaiting a decision");
  });

  it("IN_REVIEW, expired: expired before a decision, not claimable", () => {
    const input = review({ status: "IN_REVIEW", expired: true });
    const steps = reviewTimeline(input, AFTER_EXPIRY);
    expect(states(input, AFTER_EXPIRY)).toEqual(["done", "done", "expired", "skipped"]);
    expect(steps[2]).toMatchObject({ title: "Expired before a decision", at: EXPIRES });
  });

  it("APPROVED, not claimed, not expired: approved by the reviewer with the note, not yet claimed", () => {
    const input = review({ status: "APPROVED", reviewer: "alice", note: "Looks fine.", reviewedAt: "2026-11-10T10:08:00Z" });
    const steps = reviewTimeline(input, BEFORE_EXPIRY);
    expect(states(input, BEFORE_EXPIRY)).toEqual(["done", "done", "done", "current"]);
    expect(steps[1]).toMatchObject({ at: null, detail: "The start time is not recorded." });
    expect(steps[2]).toMatchObject({ title: "Approved by alice", at: "2026-11-10T10:08:00Z", note: "Looks fine." });
    expect(steps[3].title).toBe("Not yet claimed");
  });

  it("APPROVED, claimed: claimed by the agent at consumedAt", () => {
    const input = review({ status: "APPROVED", reviewer: "alice", consumedAt: "2026-11-10T10:09:00Z" });
    const steps = reviewTimeline(input, BEFORE_EXPIRY);
    expect(steps[3]).toMatchObject({ state: "done", title: "Claimed by the agent", at: "2026-11-10T10:09:00Z" });
  });

  it("APPROVED, claimed and now expired: the claim still wins, because it happened before expiry", () => {
    const input = review({ status: "APPROVED", reviewer: "alice", consumedAt: "2026-11-10T10:09:00Z", expired: true });
    expect(states(input, AFTER_EXPIRY)).toEqual(["done", "done", "done", "done"]);
  });

  it("APPROVED, not claimed, expired: expired before it was claimed", () => {
    const input = review({ status: "APPROVED", reviewer: "alice", expired: true });
    const steps = reviewTimeline(input, AFTER_EXPIRY);
    expect(steps[3]).toMatchObject({ state: "expired", title: "Expired before it was claimed", at: EXPIRES });
  });

  it("APPROVED without a note leaves the note out", () => {
    const steps = reviewTimeline(review({ status: "APPROVED", reviewer: "alice" }), BEFORE_EXPIRY);
    expect(steps[2].note).toBeUndefined();
  });

  it("REJECTED: rejected by the reviewer with the note; never claimable, expired or not", () => {
    for (const expired of [false, true]) {
      const input = review({ status: "REJECTED", reviewer: "bob", note: "Shared with prod.", reviewedAt: "2026-11-10T10:07:00Z", expired });
      const steps = reviewTimeline(input, expired ? AFTER_EXPIRY : BEFORE_EXPIRY);
      expect(steps.map((step) => step.state)).toEqual(["done", "done", "done", "skipped"]);
      expect(steps[2]).toMatchObject({ title: "Rejected by bob", note: "Shared with prod." });
      expect(steps[3].title).toBe("Not claimable");
    }
  });

  it("a consumedAt on a non-approved review (not possible per the DB CHECK) is not shown as a claim", () => {
    const input = review({ status: "REJECTED", reviewer: "bob", consumedAt: "2026-11-10T10:09:00Z" });
    expect(reviewTimeline(input, BEFORE_EXPIRY)[3].state).toBe("skipped");
  });

  it("a missing reviewer name is said, not invented", () => {
    const steps = reviewTimeline(review({ status: "APPROVED", reviewer: null }), BEFORE_EXPIRY);
    expect(steps[2].title).toBe("Approved by a reviewer (name not recorded)");
  });

  it("every status × expired × consumed combination yields exactly four steps and one Created", () => {
    const statuses: ReviewStatus[] = ["PENDING", "IN_REVIEW", "APPROVED", "REJECTED"];
    for (const status of statuses) {
      for (const expired of [false, true]) {
        for (const consumedAt of [null, "2026-11-10T10:09:00Z"]) {
          const steps = reviewTimeline(review({ status, expired, consumedAt }), expired ? AFTER_EXPIRY : BEFORE_EXPIRY);
          expect(steps).toHaveLength(4);
          expect(steps[0].state).toBe("done");
          // Only an approved review can show a claim as done.
          if (steps[3].state === "done") expect(status).toBe("APPROVED");
          // No step is "current" once the review has expired, except a completed claim's history.
          if (expired) expect(steps.some((step) => step.state === "current")).toBe(false);
        }
      }
    }
  });
});
