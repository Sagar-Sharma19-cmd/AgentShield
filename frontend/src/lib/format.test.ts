import { describe, expect, it } from "vitest";
import { formatDate, formatTimestamp } from "./format";

describe("formatDate", () => {
  it("shows the local date only, and the raw value when it cannot be parsed", () => {
    // Midday UTC is the same calendar day in every common time zone.
    expect(formatDate("2026-11-11T12:00:00Z")).toBe("Nov 11, 2026");
    expect(formatDate("not a date")).toBe("not a date");
  });

  it("is the date part of formatTimestamp", () => {
    expect(formatTimestamp("2026-11-11T12:00:00Z").startsWith(formatDate("2026-11-11T12:00:00Z"))).toBe(true);
  });
});
