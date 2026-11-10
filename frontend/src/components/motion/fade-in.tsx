"use client";

import { motion, type HTMLMotionProps } from "motion/react";
import { durations, easings, type DurationToken } from "@/lib/motion/tokens";

export interface FadeInProps extends Omit<HTMLMotionProps<"div">, "initial" | "animate" | "transition"> {
  /** Delay before the fade starts, in seconds. */
  delay?: number;
  /** Duration token. Defaults to `base` (200 ms). */
  duration?: DurationToken;
}

/**
 * Opacity-only entrance. Use for content that replaces a skeleton or appears in place, where movement
 * would suggest it came from somewhere. Reduced-motion users still get the fade: MotionConfig
 * (reducedMotion="user") only removes transform and layout animation, and opacity is not motion.
 *
 * Renders its own <div>, so never put Tailwind transition-* or animate-* classes on it; style the child.
 */
export function FadeIn({ delay = 0, duration = "base", ...props }: FadeInProps) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: durations[duration], ease: easings.enter, delay }}
      {...props}
    />
  );
}
