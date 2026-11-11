/**
 * Index stepping for the landing carousels (pipeline tabs, scenario switcher). Pure; tested in
 * carousel.test.ts.
 */

/** Moves by `delta` and wraps around. An empty carousel stays at 0. */
export function stepIndex(current: number, delta: number, length: number): number {
  if (length <= 0) return 0;
  const base = Number.isFinite(current) ? Math.trunc(current) : 0;
  return (((base + Math.trunc(delta)) % length) + length) % length;
}

export type CarouselKeyAction = { type: "step"; delta: -1 | 1 } | { type: "jump"; index: number } | null;

/** Left/Right step (wrapping), Home/End jump to the ends. Other keys do nothing. */
export function carouselKeyAction(key: string, length: number): CarouselKeyAction {
  if (length <= 0) return null;
  switch (key) {
    case "ArrowLeft":
      return { type: "step", delta: -1 };
    case "ArrowRight":
      return { type: "step", delta: 1 };
    case "Home":
      return { type: "jump", index: 0 };
    case "End":
      return { type: "jump", index: length - 1 };
    default:
      return null;
  }
}

/** Applies a key action to an index. */
export function applyCarouselKey(current: number, key: string, length: number): number | null {
  const action = carouselKeyAction(key, length);
  if (action === null) return null;
  return action.type === "jump" ? action.index : stepIndex(current, action.delta, length);
}
