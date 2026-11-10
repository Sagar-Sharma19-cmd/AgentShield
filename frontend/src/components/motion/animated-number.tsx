"use client";

import { useEffect, useRef } from "react";
import { animate, motion, useMotionValue, useReducedMotion, useTransform } from "motion/react";
import { formatAnimatedNumber, shouldAnimateNumber } from "@/lib/motion/number-format";
import { durations, easings } from "@/lib/motion/tokens";
import { cn } from "@/lib/utils";

export interface AnimatedNumberProps {
  /** The value to show. Changes animate from the currently displayed value. */
  value: number;
  /** Starting value for the first render. Defaults to 0, so the number counts up on mount. */
  from?: number;
  /** Fixed number of fraction digits. Defaults to 0. */
  decimals?: number;
  /** BCP 47 locale. Defaults to "en-US". */
  locale?: string;
  /** Duration in seconds. Defaults to `durations.countUp` (500 ms). */
  duration?: number;
  className?: string;
}

/**
 * Counts to `value`. Screen readers only ever get the final, formatted value: the moving digits are
 * aria-hidden and an sr-only copy holds the real number. With reduced motion the value is shown
 * immediately (MotionConfig does not cover imperative `animate()` calls, so this checks itself).
 * Use tabular-nums on the parent or className so the width does not jitter while counting.
 */
export function AnimatedNumber({
  value,
  from = 0,
  decimals = 0,
  locale = "en-US",
  duration = durations.countUp,
  className,
}: AnimatedNumberProps) {
  const prefersReducedMotion = useReducedMotion() ?? false;
  const motionValue = useMotionValue(prefersReducedMotion ? value : from);
  const text = useTransform(motionValue, (latest) => formatAnimatedNumber(latest, { decimals, locale }));
  const isFirstRun = useRef(true);

  useEffect(() => {
    const start = isFirstRun.current ? from : motionValue.get();
    isFirstRun.current = false;

    if (!shouldAnimateNumber(start, value, prefersReducedMotion)) {
      motionValue.jump(value);
      return;
    }
    motionValue.jump(start);
    const controls = animate(motionValue, value, { duration, ease: easings.enter });
    return () => controls.stop();
    // `from` only applies to the first run; later changes animate from the displayed value.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, prefersReducedMotion, duration, motionValue]);

  return (
    <span className={cn("tabular-nums", className)}>
      <motion.span aria-hidden="true">{text}</motion.span>
      <span className="sr-only">{formatAnimatedNumber(value, { decimals, locale })}</span>
    </span>
  );
}
