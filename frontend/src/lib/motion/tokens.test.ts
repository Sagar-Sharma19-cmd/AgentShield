import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  cssCubicBezier,
  dampingRatio,
  distances,
  durations,
  easings,
  springs,
  stagger,
  staggerDelay,
} from "./tokens";

const css = readFileSync(fileURLToPath(new URL("../../app/globals.css", import.meta.url)), "utf8");

describe("durations", () => {
  it("are ordered fast < base < slow", () => {
    expect(durations.fast).toBeLessThan(durations.base);
    expect(durations.base).toBeLessThan(durations.slow);
  });

  it("keep interface motion within 100–320 ms", () => {
    for (const value of [durations.fast, durations.base, durations.slow]) {
      expect(value).toBeGreaterThanOrEqual(0.1);
      expect(value).toBeLessThanOrEqual(0.32);
    }
  });

  it("keeps the count-up under 500 ms", () => {
    expect(durations.countUp).toBeLessThanOrEqual(0.5);
  });
});

describe("easings", () => {
  it("are valid cubic-bézier curves (x control points within [0, 1])", () => {
    for (const [x1, , x2] of Object.values(easings)) {
      expect(x1).toBeGreaterThanOrEqual(0);
      expect(x1).toBeLessThanOrEqual(1);
      expect(x2).toBeGreaterThanOrEqual(0);
      expect(x2).toBeLessThanOrEqual(1);
    }
  });

  it.each([
    ["standard", "--ease-standard"],
    ["enter", "--ease-enter"],
    ["exit", "--ease-exit"],
  ] as const)("%s matches %s in globals.css", (token, variable) => {
    const match = new RegExp(`${variable}:\\s*([^;]+);`).exec(css);
    expect(match, `${variable} is missing from globals.css`).not.toBeNull();
    expect(match![1].trim()).toBe(cssCubicBezier(easings[token]));
  });
});

describe("springs", () => {
  it.each(Object.entries(springs))("%s settles without visible bounce (damping ratio ≥ 0.8)", (_, spring) => {
    expect(dampingRatio(spring)).toBeGreaterThanOrEqual(0.8);
  });

  it("computes a critically damped ratio as 1", () => {
    expect(dampingRatio({ type: "spring", stiffness: 100, damping: 20, mass: 1 })).toBeCloseTo(1);
  });
});

describe("distances", () => {
  it("stay small (≤ 12 px)", () => {
    for (const value of Object.values(distances)) {
      expect(value).toBeGreaterThan(0);
      expect(value).toBeLessThanOrEqual(12);
    }
  });
});

describe("staggerDelay", () => {
  it("is 0 for empty, single-item and invalid lists", () => {
    expect(staggerDelay(0)).toBe(0);
    expect(staggerDelay(1)).toBe(0);
    expect(staggerDelay(Number.NaN)).toBe(0);
  });

  it("uses the per-item delay for short lists", () => {
    expect(staggerDelay(4)).toBe(stagger.each);
  });

  it("caps the total delay for long lists", () => {
    const count = 50;
    const delay = staggerDelay(count);
    expect(delay * (count - 1)).toBeCloseTo(stagger.maxTotal);
    expect(delay).toBeLessThan(stagger.each);
  });
});

describe("checkpointMotion", () => {
  it("settles a full replay of 12 travelling dots within one second", async () => {
    const { checkpointMotion } = await import("./tokens");
    const { DEFAULT_STREAM_LIMITS } = await import("@/lib/checkpoint/stream");
    const total = (DEFAULT_STREAM_LIMITS.maxConcurrent - 1) * checkpointMotion.stagger + checkpointMotion.travel;
    expect(total).toBeLessThanOrEqual(1);
  });
});
