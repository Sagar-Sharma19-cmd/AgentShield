/**
 * Camera states for the /welcome robot, one per section (intro, product, scenarios). Pure data; the scene
 * applies them through blendCamera + frameCamera (camera.ts). Tested in camera.test.ts.
 *
 * World layout (sentinel-scene.tsx): the robot stands at x = 0 on a pedestal; its body centre is about
 * y = 1.55 and its head centre y = 2.46. The checkpoint ring under it is 3.24 wide.
 *
 * Wide (> 900 px): text columns sit on the left for intro and product, so the robot is framed in the right
 * part of the screen; for scenarios the content sits on the right, so the robot moves to the left. Each
 * framing caps the robot's share of the viewport width, so at 900–1200 px it shrinks instead of reaching the
 * text, and its right edge stays clear of the section rail shown from 1200 px.
 *
 * Narrow (≤ 900 px): the robot is centred in the top part of the screen above the text.
 */
import type { CameraState } from "./camera";

const BODY_CENTRE = 1.55;
const HEAD_CENTRE = 2.46;
const BODY = { subjectWidth: 3.4, subjectHeight: 3.3 } as const;
const HEAD = { subjectWidth: 1.5, subjectHeight: 1.3 } as const;

export const WIDE_CAMERA_STATES: readonly CameraState[] = [
  {
    position: [-0.2, 2.4, 8.4],
    target: [0, BODY_CENTRE, 0],
    fov: 34,
    framing: { screenX: 0.71, screenY: 0.45, ...BODY, maxWidth: 0.34, maxHeight: 0.78 },
  },
  {
    position: [-0.2, 2.71, 3.7],
    target: [0, HEAD_CENTRE, 0],
    fov: 30,
    framing: { screenX: 0.73, screenY: 0.52, ...HEAD, maxWidth: 0.3, maxHeight: 0.55 },
  },
  {
    position: [0.9, 2.15, 6.9],
    target: [0, BODY_CENTRE, 0],
    fov: 34,
    framing: { screenX: 0.28, screenY: 0.47, ...BODY, maxWidth: 0.34, maxHeight: 0.78 },
  },
];

export const NARROW_CAMERA_STATES: readonly CameraState[] = [
  {
    position: [0, 2.4, 9],
    target: [0, BODY_CENTRE, 0],
    fov: 34,
    framing: { screenX: 0.5, screenY: 0.76, ...BODY, maxWidth: 0.8, maxHeight: 0.32 },
  },
  {
    position: [0.2, 2.7, 5],
    target: [0, HEAD_CENTRE, 0],
    fov: 30,
    framing: { screenX: 0.5, screenY: 0.8, ...HEAD, maxWidth: 0.6, maxHeight: 0.24 },
  },
  {
    position: [1.2, 2.1, 8.6],
    target: [0, BODY_CENTRE, 0],
    fov: 34,
    framing: { screenX: 0.5, screenY: 0.78, ...BODY, maxWidth: 0.8, maxHeight: 0.3 },
  },
];

/** Viewport width at and below which the narrow states apply (matches the page's 900 px breakpoint). */
export const NARROW_MAX_WIDTH = 900;

/** Share of each section-to-section scroll segment the camera dwells on its state at either end. */
export const CAMERA_HOLD = 0.2;
