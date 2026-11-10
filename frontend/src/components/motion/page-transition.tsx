"use client";

import { motion, type HTMLMotionProps } from "motion/react";
import { durations, easings } from "@/lib/motion/tokens";

export interface PageTransitionProps extends Omit<HTMLMotionProps<"div">, "initial" | "animate" | "transition"> {
  /**
   * Identity of the current page, normally the pathname. A new key remounts the wrapper and replays
   * the entrance. Query-string changes (filters, pagination) should not change it.
   */
  routeKey: string;
}

/**
 * Enter-only fade for a route change. Deliberately opacity-only:
 * - no exit animation, because the App Router unmounts the old page before the new one renders;
 * - no transform, because a transformed ancestor becomes the containing block for position:fixed
 *   descendants and would break sticky table headers and fixed overlays during the animation.
 */
export function PageTransition({ routeKey, ...props }: PageTransitionProps) {
  return (
    <motion.div
      key={routeKey}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: durations.base, ease: easings.enter }}
      {...props}
    />
  );
}
