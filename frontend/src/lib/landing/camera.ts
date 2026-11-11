/**
 * Scroll-driven camera for the /welcome scene. Pure: no three.js, no DOM. Tested in camera.test.ts.
 *
 * The page has one camera state per section (intro, product, scenarios). Scroll position becomes a
 * continuous stage progress t in [0, states - 1]; between two states the blend is eased, so the camera
 * starts and settles gently. Everything is clamped, so overscroll or a stale layout never sends the
 * camera past the first or last state.
 *
 * Framing (F8.1): a state can say where on screen its subject must sit and how much of the viewport it may
 * take. `frameCamera` turns that into a camera for the current aspect ratio: it backs the camera off until
 * the subject fits, then slides camera and look-at sideways/vertically so the subject lands on its screen
 * anchor. This keeps the robot out of the text column at every viewport width.
 */

export type Vec3 = readonly [number, number, number];

export interface Framing {
  /** Where the camera target should appear: x from the left, y from the bottom, 0–1 (0.5 = centre). */
  screenX: number;
  screenY: number;
  /** Size of the subject around the target, in world units. */
  subjectWidth: number;
  subjectHeight: number;
  /** Largest share of the viewport width / height the subject may take, 0–1. */
  maxWidth: number;
  maxHeight: number;
}

export interface CameraState {
  position: Vec3;
  /** Point the camera looks at. With framing, this is the subject's centre. */
  target: Vec3;
  /** Vertical field of view in degrees. */
  fov: number;
  framing?: Framing;
}

export function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min;
  return Math.min(max, Math.max(min, value));
}

/** Smooth start and stop, symmetric around 0.5. Input is clamped to [0, 1]. */
export function easeInOutCubic(t: number): number {
  const x = clamp(t, 0, 1);
  return x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerpVec(a: Vec3, b: Vec3, t: number): Vec3 {
  return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
}

function lerpFraming(a: Framing, b: Framing, t: number): Framing {
  return {
    screenX: lerp(a.screenX, b.screenX, t),
    screenY: lerp(a.screenY, b.screenY, t),
    subjectWidth: lerp(a.subjectWidth, b.subjectWidth, t),
    subjectHeight: lerp(a.subjectHeight, b.subjectHeight, t),
    maxWidth: lerp(a.maxWidth, b.maxWidth, t),
    maxHeight: lerp(a.maxHeight, b.maxHeight, t),
  };
}

/**
 * Stage progress from scroll. `anchors` are the scroll positions at which each state should be exactly
 * reached (the page uses "section centred in the viewport"). Between anchor i and i+1 progress goes from i
 * to i+1. `hold` (0–0.45) is the share at each end of a segment where the camera stays on its state, so it
 * dwells while a section is read instead of drifting on toward the next one.
 */
export function stageProgress(scrollY: number, anchors: readonly number[], hold = 0): number {
  const count = anchors.length;
  if (count <= 1) return 0;
  if (scrollY <= anchors[0]) return 0;
  const h = clamp(hold, 0, 0.45);
  for (let i = 0; i < count - 1; i += 1) {
    const start = anchors[i];
    const end = anchors[i + 1];
    if (scrollY < end) {
      const span = end - start;
      if (span <= 0) return i + 1;
      const raw = clamp((scrollY - start) / span, 0, 1);
      return i + clamp((raw - h) / (1 - 2 * h), 0, 1);
    }
  }
  return count - 1;
}

/** The camera at stage progress t, eased within each segment and clamped to the defined states. */
export function blendCamera(states: readonly CameraState[], t: number): CameraState {
  if (states.length === 0) throw new Error("blendCamera needs at least one camera state.");
  const last = states.length - 1;
  const clamped = clamp(t, 0, last);
  const index = Math.min(Math.floor(clamped), Math.max(0, last - 1));
  const from = states[index];
  const to = states[Math.min(index + 1, last)];
  const local = last === 0 ? 0 : easeInOutCubic(clamped - index);
  const blended: CameraState = {
    position: lerpVec(from.position, to.position, local),
    target: lerpVec(from.target, to.target, local),
    fov: lerp(from.fov, to.fov, local),
  };
  if (from.framing && to.framing) blended.framing = lerpFraming(from.framing, to.framing, local);
  else if (from.framing) blended.framing = from.framing;
  return blended;
}

/**
 * Applies a state's framing for a viewport aspect ratio (width / height). Returns a plain camera (no
 * framing) whose view puts the target at (screenX, screenY) with the subject inside its size limits. The
 * camera only ever moves back (never closer than the state's own distance), and shifts parallel to the
 * view plane (horizontal right vector, world up), so the viewing angle is kept.
 */
export function frameCamera(state: CameraState, aspect: number): CameraState {
  const { framing } = state;
  if (!framing || !(aspect > 0)) return { position: state.position, target: state.target, fov: state.fov };

  const [tx, ty, tz] = state.target;
  const dx = state.position[0] - tx;
  const dy = state.position[1] - ty;
  const dz = state.position[2] - tz;
  const baseDistance = Math.hypot(dx, dy, dz) || 1;
  const tanHalf = Math.tan(((state.fov * Math.PI) / 180) / 2);

  const fitWidth = framing.subjectWidth / (Math.max(framing.maxWidth, 0.01) * 2 * tanHalf * aspect);
  const fitHeight = framing.subjectHeight / (Math.max(framing.maxHeight, 0.01) * 2 * tanHalf);
  const distance = Math.max(baseDistance, fitWidth, fitHeight);
  const scale = distance / baseDistance;

  const visibleHeight = 2 * distance * tanHalf;
  const visibleWidth = visibleHeight * aspect;
  const shiftX = (framing.screenX - 0.5) * visibleWidth;
  const shiftY = (framing.screenY - 0.5) * visibleHeight;

  // Horizontal right vector of a camera looking from position to target: (-forward.z, 0, forward.x).
  const fx = -dx;
  const fz = -dz;
  const length = Math.hypot(fx, fz) || 1;
  const rx = -fz / length;
  const rz = fx / length;

  // Moving the camera and look-at left/down makes the target appear right/up.
  const ox = -rx * shiftX;
  const oz = -rz * shiftX;
  const oy = -shiftY;

  return {
    position: [tx + dx * scale + ox, ty + dy * scale + oy, tz + dz * scale + oz],
    target: [tx + ox, ty + oy, tz + oz],
    fov: state.fov,
  };
}

/**
 * Frame-rate independent smoothing toward a target (exponential decay). `lambda` is how fast it closes the
 * gap per second; dt is clamped so a long pause (tab hidden) jumps at most a quarter second.
 */
export function damp(current: number, target: number, lambda: number, dtSeconds: number): number {
  const dt = clamp(dtSeconds, 0, 0.25);
  return lerp(current, target, 1 - Math.exp(-lambda * dt));
}

/** Pointer position in the viewport, normalised to [-1, 1] on both axes (y up). Clamped. */
export function normalisedPointer(x: number, y: number, width: number, height: number): { x: number; y: number } {
  if (width <= 0 || height <= 0) return { x: 0, y: 0 };
  return { x: clamp((x / width) * 2 - 1, -1, 1), y: clamp(1 - (y / height) * 2, -1, 1) };
}

/**
 * Projects a world point to screen fractions (x from the left, y from the bottom) for a camera that looks
 * from `position` at `target` with world up. Used by the tests to prove where framing puts the subject.
 */
export function projectToScreen(point: Vec3, camera: CameraState, aspect: number): { x: number; y: number } {
  const [px, py, pz] = camera.position;
  let fx = camera.target[0] - px;
  let fy = camera.target[1] - py;
  let fz = camera.target[2] - pz;
  const fl = Math.hypot(fx, fy, fz) || 1;
  fx /= fl;
  fy /= fl;
  fz /= fl;
  // right = forward × up(0,1,0); up' = right × forward
  let rx = -fz;
  let rz = fx;
  const rl = Math.hypot(rx, rz) || 1;
  rx /= rl;
  rz /= rl;
  const ux = -rz * fy;
  const uy = rz * fx - rx * fz;
  const uz = rx * fy;
  const vx = point[0] - px;
  const vy = point[1] - py;
  const vz = point[2] - pz;
  const depth = vx * fx + vy * fy + vz * fz;
  const tanHalf = Math.tan(((camera.fov * Math.PI) / 180) / 2);
  const sx = (vx * rx + vz * rz) / (depth * tanHalf * aspect);
  const sy = (vx * ux + vy * uy + vz * uz) / (depth * tanHalf);
  return { x: (sx + 1) / 2, y: (sy + 1) / 2 };
}
