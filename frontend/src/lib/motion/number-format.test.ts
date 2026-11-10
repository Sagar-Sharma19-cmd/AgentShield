import { describe, expect, it } from "vitest";
import { formatAnimatedNumber, normalizeDecimals, shouldAnimateNumber } from "./number-format";

describe("formatAnimatedNumber", () => {
  it("rounds intermediate values to whole numbers by default", () => {
    expect(formatAnimatedNumber(41.6)).toBe("42");
    expect(formatAnimatedNumber(0.4)).toBe("0");
  });

  it("groups thousands", () => {
    expect(formatAnimatedNumber(12345)).toBe("12,345");
  });

  it("keeps a fixed number of decimals", () => {
    expect(formatAnimatedNumber(12.3, { decimals: 1 })).toBe("12.3");
    expect(formatAnimatedNumber(12, { decimals: 2 })).toBe("12.00");
    expect(formatAnimatedNumber(99.996, { decimals: 2 })).toBe("100.00");
  });

  it("never renders negative zero", () => {
    expect(formatAnimatedNumber(-0.4)).toBe("0");
    expect(formatAnimatedNumber(-0)).toBe("0");
  });

  it("formats negative values", () => {
    expect(formatAnimatedNumber(-1234.5, { decimals: 1 })).toBe("-1,234.5");
  });

  it("renders non-finite values as an en dash", () => {
    expect(formatAnimatedNumber(Number.NaN)).toBe("–");
    expect(formatAnimatedNumber(Number.POSITIVE_INFINITY)).toBe("–");
  });

  it("honours the locale", () => {
    expect(formatAnimatedNumber(1234.5, { decimals: 1, locale: "de-DE" })).toBe("1.234,5");
  });
});

describe("normalizeDecimals", () => {
  it("clamps to Intl's 0–20 range and truncates fractions", () => {
    expect(normalizeDecimals(undefined)).toBe(0);
    expect(normalizeDecimals(-3)).toBe(0);
    expect(normalizeDecimals(2.9)).toBe(2);
    expect(normalizeDecimals(50)).toBe(20);
    expect(normalizeDecimals(Number.NaN)).toBe(0);
  });
});

describe("shouldAnimateNumber", () => {
  it("animates a real change", () => {
    expect(shouldAnimateNumber(0, 10, false)).toBe(true);
  });

  it("does not animate for reduced-motion users", () => {
    expect(shouldAnimateNumber(0, 10, true)).toBe(false);
  });

  it("does not animate when the value is unchanged", () => {
    expect(shouldAnimateNumber(5, 5, false)).toBe(false);
  });

  it("does not animate to or from a non-finite value", () => {
    expect(shouldAnimateNumber(Number.NaN, 5, false)).toBe(false);
    expect(shouldAnimateNumber(0, Number.POSITIVE_INFINITY, false)).toBe(false);
  });
});
