/**
 * Motion tokens for AgentShield (spec: docs/frontend-design-system.md, "Motion system").
 *
 * Pure data, no React and no "motion" import, so it is safe in Server Components, tests and CSS
 * generation. Durations are in seconds because that is what motion/react expects.
 */

/** Cubic-bézier control points, the form motion/react accepts for `ease`. */
export type CubicBezier = readonly [number, number, number, number];

export interface SpringPreset {
  readonly type: "spring";
  readonly stiffness: number;
  readonly damping: number;
  readonly mass: number;
}

/**
 * Durations in seconds. Interface motion stays at or under `slow` (320 ms). `countUp` is the only
 * longer value; it is reserved for numbers, which users read after they settle, not during.
 */
export const durations = {
  /** Hover, press, toggles, colour and opacity state changes. */
  fast: 0.12,
  /** Entrances, list item insertion, popovers, page fade. */
  base: 0.2,
  /** Sheets, dialogs, larger surfaces and layout shifts. */
  slow: 0.32,
  /** AnimatedNumber count-up. */
  countUp: 0.5,
} as const;

export type DurationToken = keyof typeof durations;

export const easings = {
  /** Default for state changes. Mirrors --ease-standard in globals.css. */
  standard: [0.2, 0.7, 0.2, 1],
  /** Decelerating curve for things arriving on screen. Mirrors --ease-enter. */
  enter: [0.16, 1, 0.3, 1],
  /** Accelerating curve for things leaving. Mirrors --ease-exit. */
  exit: [0.4, 0, 1, 1],
} as const satisfies Record<string, CubicBezier>;

export type EasingToken = keyof typeof easings;

/**
 * Springs are all close to critically damped (damping ratio ≥ 0.8): they settle without a visible
 * bounce, which keeps the console calm. tokens.test.ts enforces this.
 */
export const springs = {
  /** Small, quick UI: toggles, selection indicators, badges. */
  snappy: { type: "spring", stiffness: 500, damping: 40, mass: 1 },
  /** Default for layout changes such as list reordering or a row being inserted. */
  layout: { type: "spring", stiffness: 380, damping: 36, mass: 1 },
  /** Larger surfaces: sheets and panels. */
  gentle: { type: "spring", stiffness: 260, damping: 30, mass: 1 },
} as const satisfies Record<string, SpringPreset>;

export type SpringToken = keyof typeof springs;

/** Travel distances in px. Movement is small; it hints at direction rather than performing. */
export const distances = {
  /** SlideUp / StaggerItem offset. */
  rise: 8,
  /** Page transition offset (only used if a page opts in; the default page transition is fade-only). */
  page: 4,
} as const;

/** Stagger timing for lists, in seconds. The total delay is capped so long lists do not crawl in. */
export const stagger = {
  each: 0.04,
  maxTotal: 0.3,
} as const;

/** Damping ratio ζ = c / (2·√(k·m)). 1 is critically damped; below 1 overshoots. */
export function dampingRatio({ stiffness, damping, mass }: SpringPreset): number {
  return damping / (2 * Math.sqrt(stiffness * mass));
}

/**
 * Per-child stagger delay for a list of `count` items, so that the last item starts no later than
 * `stagger.maxTotal`. Returns 0 for lists of one or fewer.
 */
export function staggerDelay(count: number, each: number = stagger.each, maxTotal: number = stagger.maxTotal): number {
  if (!Number.isFinite(count) || count <= 1) return 0;
  return Math.min(each, maxTotal / (count - 1));
}

/** CSS `cubic-bezier()` string for an easing token, for CSS-only transitions. */
export function cssCubicBezier(curve: CubicBezier): string {
  return `cubic-bezier(${curve.join(", ")})`;
}

/**
 * CheckpointStream timing (Overview). Each dot travels for `slow`, and travelling dots leave
 * `stagger` seconds apart. With at most 12 travelling dots (DEFAULT_STREAM_LIMITS.maxConcurrent), a full
 * replay settles in under a second.
 */
export const checkpointMotion = {
  travel: durations.slow,
  stagger: 0.05,
} as const;
