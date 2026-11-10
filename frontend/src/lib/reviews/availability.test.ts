import { describe, expect, it } from "vitest";
import { actionAvailability, START_FIRST_REASON } from "./availability";

const EXPIRES = "2026-11-10T10:30:00Z";
const BEFORE = Date.parse("2026-11-10T10:10:00Z");
const AFTER = Date.parse("2026-11-10T10:33:00Z");

describe("actionAvailability", () => {
  it("PENDING: only Start is enabled; Approve/Reject explain that it must be started", () => {
    expect(actionAvailability({ status: "PENDING", expired: false, expiresAt: EXPIRES }, BEFORE)).toEqual([
      { action: "start", enabled: true },
      { action: "approve", enabled: false, reason: START_FIRST_REASON },
      { action: "reject", enabled: false, reason: START_FIRST_REASON },
    ]);
  });

  it("IN_REVIEW: Approve and Reject are enabled", () => {
    expect(actionAvailability({ status: "IN_REVIEW", expired: false, expiresAt: EXPIRES }, BEFORE)).toEqual([
      { action: "approve", enabled: true },
      { action: "reject", enabled: true },
    ]);
  });

  it("expired open reviews: everything disabled, with how long ago it expired", () => {
    const result = actionAvailability({ status: "IN_REVIEW", expired: true, expiresAt: EXPIRES }, AFTER);
    expect(result.every((item) => !item.enabled)).toBe(true);
    expect(result[0].reason).toMatch(/^Expired 3 min ago\./);
    // By the local clock alone, too.
    expect(actionAvailability({ status: "PENDING", expired: false, expiresAt: EXPIRES }, AFTER).every((item) => !item.enabled)).toBe(true);
  });

  it("decided reviews show no actions", () => {
    expect(actionAvailability({ status: "APPROVED", expired: false, expiresAt: EXPIRES }, BEFORE)).toEqual([]);
    expect(actionAvailability({ status: "REJECTED", expired: true, expiresAt: EXPIRES }, AFTER)).toEqual([]);
  });
});
