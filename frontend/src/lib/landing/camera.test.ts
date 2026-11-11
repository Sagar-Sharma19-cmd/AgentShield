import { describe, expect, it } from "vitest";
import {
  blendCamera,
  clamp,
  damp,
  easeInOutCubic,
  frameCamera,
  normalisedPointer,
  projectToScreen,
  stageProgress,
  type CameraState,
  type Vec3,
} from "./camera";
import { CAMERA_HOLD, NARROW_CAMERA_STATES, WIDE_CAMERA_STATES } from "./camera-states";

const A: CameraState = { position: [0, 0, 10], target: [0, 0, 0], fov: 40 };
const B: CameraState = { position: [10, 2, 4], target: [0, 2, 0], fov: 30 };
const C: CameraState = { position: [-4, 1, 8], target: [1, 1, 0], fov: 36 };

describe("easeInOutCubic", () => {
  it("is 0, 0.5 and 1 at the ends and middle, and clamps outside [0, 1]", () => {
    expect(easeInOutCubic(0)).toBe(0);
    expect(easeInOutCubic(0.5)).toBeCloseTo(0.5);
    expect(easeInOutCubic(1)).toBe(1);
    expect(easeInOutCubic(-3)).toBe(0);
    expect(easeInOutCubic(4)).toBe(1);
  });

  it("starts and ends slower than linear", () => {
    expect(easeInOutCubic(0.1)).toBeLessThan(0.1);
    expect(easeInOutCubic(0.9)).toBeGreaterThan(0.9);
  });
});

describe("stageProgress", () => {
  const tops = [0, 1000, 2500];

  it("maps scroll between section tops to a continuous progress", () => {
    expect(stageProgress(0, tops)).toBe(0);
    expect(stageProgress(500, tops)).toBe(0.5);
    expect(stageProgress(1000, tops)).toBe(1);
    expect(stageProgress(1750, tops)).toBe(1.5);
  });

  it("clamps above the first and past the last section", () => {
    expect(stageProgress(-200, tops)).toBe(0);
    expect(stageProgress(99999, tops)).toBe(2);
  });

  it("handles a single section and zero-height segments", () => {
    expect(stageProgress(500, [0])).toBe(0);
    expect(stageProgress(100, [0, 100, 100])).toBe(2);
  });
});

describe("blendCamera", () => {
  it("returns each state exactly at integer progress", () => {
    expect(blendCamera([A, B, C], 0)).toEqual(A);
    expect(blendCamera([A, B, C], 1)).toEqual(B);
    expect(blendCamera([A, B, C], 2)).toEqual(C);
  });

  it("is eased between states (half way in time is half way in space for a symmetric ease)", () => {
    const mid = blendCamera([A, B], 0.5);
    expect(mid.position[0]).toBeCloseTo(5);
    expect(mid.fov).toBeCloseTo(35);
    expect(blendCamera([A, B], 0.25).position[0]).toBeLessThan(2.5);
  });

  it("clamps progress outside the defined states", () => {
    expect(blendCamera([A, B, C], -1)).toEqual(A);
    expect(blendCamera([A, B, C], 7)).toEqual(C);
    expect(blendCamera([A, B, C], Number.NaN)).toEqual(A);
    expect(blendCamera([A], 3)).toEqual(A);
  });

  it("refuses an empty list", () => {
    expect(() => blendCamera([], 0)).toThrow();
  });
});

describe("damp", () => {
  it("moves toward the target without overshooting, and caps a long frame", () => {
    const next = damp(0, 10, 4, 1 / 60);
    expect(next).toBeGreaterThan(0);
    expect(next).toBeLessThan(10);
    expect(damp(0, 10, 4, 10)).toBeCloseTo(damp(0, 10, 4, 0.25));
    expect(damp(3, 10, 4, 0)).toBe(3);
  });
});

describe("normalisedPointer and clamp", () => {
  it("maps the viewport to [-1, 1] with y up", () => {
    expect(normalisedPointer(0, 0, 200, 100)).toEqual({ x: -1, y: 1 });
    expect(normalisedPointer(100, 50, 200, 100)).toEqual({ x: 0, y: 0 });
    expect(normalisedPointer(500, 500, 200, 100)).toEqual({ x: 1, y: -1 });
    expect(normalisedPointer(10, 10, 0, 0)).toEqual({ x: 0, y: 0 });
  });

  it("clamps NaN to the minimum", () => {
    expect(clamp(Number.NaN, 2, 5)).toBe(2);
  });
});

describe("stageProgress hold", () => {
  const anchors = [0, 1000, 2000];

  it("dwells on a state at both ends of a segment, then blends across the middle", () => {
    expect(stageProgress(100, anchors, 0.2)).toBe(0);
    expect(stageProgress(500, anchors, 0.2)).toBeCloseTo(0.5);
    expect(stageProgress(900, anchors, 0.2)).toBe(1);
    expect(stageProgress(1150, anchors, 0.2)).toBe(1);
    expect(stageProgress(1500, anchors, 0.2)).toBeCloseTo(1.5);
  });

  it("clamps an out-of-range hold", () => {
    expect(stageProgress(500, anchors, 5)).toBeCloseTo(0.5);
    expect(stageProgress(500, anchors, -1)).toBeCloseTo(0.5);
  });
});

describe("frameCamera", () => {
  const state: CameraState = {
    position: [0, 2, 8],
    target: [0, 2, 0],
    fov: 40,
    framing: { screenX: 0.75, screenY: 0.5, subjectWidth: 2, subjectHeight: 2, maxWidth: 0.3, maxHeight: 0.8 },
  };

  it("puts the target on its screen anchor", () => {
    for (const aspect of [0.5, 1, 1.6, 2.2]) {
      const framed = frameCamera(state, aspect);
      const at = projectToScreen(state.target, framed, aspect);
      expect(at.x).toBeCloseTo(0.75, 5);
      expect(at.y).toBeCloseTo(0.5, 5);
    }
  });

  it("backs off on narrow aspects so the subject keeps within its width share, and never moves closer", () => {
    const wide = frameCamera(state, 2.2);
    const narrow = frameCamera(state, 1);
    const distance = (c: CameraState) => Math.hypot(...(c.position.map((v, i) => v - c.target[i]) as [number, number, number]));
    expect(distance(narrow)).toBeGreaterThan(distance(wide));
    expect(distance(wide)).toBeGreaterThanOrEqual(8 - 1e-9);
    const left = projectToScreen([-1, 2, 0], narrow, 1).x;
    const right = projectToScreen([1, 2, 0], narrow, 1).x;
    expect(right - left).toBeLessThanOrEqual(0.3 + 1e-6);
  });

  it("returns the plain camera when there is no framing", () => {
    expect(frameCamera({ position: [1, 2, 3], target: [0, 0, 0], fov: 30 }, 1.5)).toEqual({ position: [1, 2, 3], target: [0, 0, 0], fov: 30 });
  });

  it("blends framing between states", () => {
    const a: CameraState = { ...state, framing: { ...state.framing!, screenX: 0.7 } };
    const b: CameraState = { ...state, framing: { ...state.framing!, screenX: 0.3 } };
    expect(blendCamera([a, b], 0.5).framing?.screenX).toBeCloseTo(0.5);
  });
});

/** Horizontal screen span of the subject (its full width around the target), at the given aspect. */
function span(camera: CameraState, aspect: number) {
  const framed = frameCamera(camera, aspect);
  const halfWidth = camera.framing!.subjectWidth / 2;
  const [x, y, z] = camera.target as Vec3;
  const left = projectToScreen([x - halfWidth, y, z], framed, aspect).x;
  const right = projectToScreen([x + halfWidth, y, z], framed, aspect).x;
  return { left: Math.min(left, right), right: Math.max(left, right), centreY: projectToScreen(camera.target, framed, aspect).y };
}

describe("landing camera states", () => {
  const [intro, product, scenarios] = WIDE_CAMERA_STATES;
  // 900x800 (narrow desktop), 1024x768, 1280x800, 1440x900 and 1920x1080.
  const wideAspects = [901 / 800, 1024 / 768, 1280 / 800, 1440 / 900, 1920 / 1080];

  it("frames the robot in the right half for intro and product, clear of a 50% text column and the rail", () => {
    for (const aspect of wideAspects) {
      for (const state of [intro, product]) {
        const { left, right } = span(state, aspect);
        expect(left).toBeGreaterThanOrEqual(0.52);
        expect(right).toBeLessThanOrEqual(0.9);
      }
    }
  });

  it("frames the robot in the left half for scenarios, clear of the content columns", () => {
    for (const aspect of wideAspects) {
      const { left, right } = span(scenarios, aspect);
      expect(left).toBeGreaterThanOrEqual(0.05);
      expect(right).toBeLessThanOrEqual(0.48);
    }
  });

  it("puts the robot centred in the top part of the screen on narrow viewports", () => {
    for (const aspect of [375 / 812, 390 / 844, 768 / 1024]) {
      const introSpan = span(NARROW_CAMERA_STATES[0], aspect);
      expect((introSpan.left + introSpan.right) / 2).toBeCloseTo(0.5, 5);
      const framed = frameCamera(NARROW_CAMERA_STATES[0], aspect);
      const bottom = projectToScreen([0, 0.34, 0], framed, aspect).y;
      expect(bottom).toBeGreaterThanOrEqual(0.58);
    }
  });

  it("dwells long enough to read each section", () => {
    expect(CAMERA_HOLD).toBeGreaterThan(0);
    expect(CAMERA_HOLD).toBeLessThan(0.45);
  });
});
