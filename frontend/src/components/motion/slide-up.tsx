"use client";

import { motion, type HTMLMotionProps } from "motion/react";
import { distances, durations, easings, type DurationToken } from "@/lib/motion/tokens";

export interface SlideUpProps extends Omit<HTMLMotionProps<"div">, "initial" | "animate" | "transition"> {
  /** Delay before the entrance starts, in seconds. */
  delay?: number;
  /** Duration token. Defaults to `base` (200 ms). */
  duration?: DurationToken;
  /** Starting offset in px below the final position. Defaults to `distances.rise` (8 px). */
  offset?: number;
}

/**
 * Fade plus a short rise. Use for new surfaces entering the page (cards, panels, a result block).
 * With reduced motion the rise is dropped by MotionConfig and only the fade remains.
 *
 * Renders its own <div>, so never put Tailwind transition-* or animate-* classes on it; style the child.
 */
export function SlideUp({ delay = 0, duration = "base", offset = distances.rise, ...props }: SlideUpProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: offset }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: durations[duration], ease: easings.enter, delay }}
      {...props}
    />
  );
}
