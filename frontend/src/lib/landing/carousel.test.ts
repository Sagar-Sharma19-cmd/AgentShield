import { describe, expect, it } from "vitest";
import { applyCarouselKey, carouselKeyAction, stepIndex } from "./carousel";

describe("stepIndex", () => {
  it("steps forward and back with wrap-around", () => {
    expect(stepIndex(0, 1, 7)).toBe(1);
    expect(stepIndex(6, 1, 7)).toBe(0);
    expect(stepIndex(0, -1, 7)).toBe(6);
    expect(stepIndex(3, -10, 7)).toBe(0);
  });

  it("stays at 0 for an empty carousel and ignores non-finite input", () => {
    expect(stepIndex(4, 1, 0)).toBe(0);
    expect(stepIndex(Number.NaN, 1, 3)).toBe(1);
  });
});

describe("carousel keys", () => {
  it("maps Left/Right to steps and Home/End to the ends", () => {
    expect(carouselKeyAction("ArrowLeft", 5)).toEqual({ type: "step", delta: -1 });
    expect(carouselKeyAction("ArrowRight", 5)).toEqual({ type: "step", delta: 1 });
    expect(carouselKeyAction("Home", 5)).toEqual({ type: "jump", index: 0 });
    expect(carouselKeyAction("End", 5)).toEqual({ type: "jump", index: 4 });
    expect(carouselKeyAction("Enter", 5)).toBeNull();
    expect(carouselKeyAction("ArrowRight", 0)).toBeNull();
  });

  it("applies a key to an index", () => {
    expect(applyCarouselKey(4, "ArrowRight", 5)).toBe(0);
    expect(applyCarouselKey(0, "ArrowLeft", 5)).toBe(4);
    expect(applyCarouselKey(2, "End", 5)).toBe(4);
    expect(applyCarouselKey(2, "a", 5)).toBeNull();
  });
});
