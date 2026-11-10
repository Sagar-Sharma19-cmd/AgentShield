"use client";

import { motion, type HTMLMotionProps, type Variants } from "motion/react";
import { distances, durations, easings, stagger as staggerTokens, staggerDelay } from "@/lib/motion/tokens";

type ControlledProps = "initial" | "animate" | "variants" | "transition";

export interface StaggerProps extends Omit<HTMLMotionProps<"div">, ControlledProps> {
  /** Element to render. Use "ul"/"ol" with StaggerItem as="li" to keep list semantics. */
  as?: "div" | "ul" | "ol";
  /**
   * Number of children, when known. Lets the per-item delay shrink so the whole list finishes within
   * `stagger.maxTotal` (300 ms). Without it each item waits `stagger.each` (40 ms).
   */
  count?: number;
  /** Delay before the first child starts, in seconds. */
  delay?: number;
}

export interface StaggerItemProps extends Omit<HTMLMotionProps<"div">, ControlledProps> {
  /** Element to render. Use "li" inside a Stagger rendered as "ul"/"ol". */
  as?: "div" | "li";
}

const itemVariants: Variants = {
  hidden: { opacity: 0, y: distances.rise },
  shown: { opacity: 1, y: 0, transition: { duration: durations.base, ease: easings.enter } },
};

/*
 * motion.ul / motion.ol / motion.li accept the same props as motion.div apart from the ref element
 * type, which these primitives do not expose differently. The casts keep one prop type per component.
 */
const containerTags = { div: motion.div, ul: motion.ul as typeof motion.div, ol: motion.ol as typeof motion.div };
const itemTags = { div: motion.div, li: motion.li as typeof motion.div };

/**
 * Staggers the entrance of its StaggerItem children. Use once per view for the first render of a
 * list or grid (stat tiles, cards); do not re-run it on refetch. Only direct StaggerItem descendants
 * animate. Reduced-motion users get a plain fade (MotionConfig drops the rise).
 */
export function Stagger({ as = "div", count, delay = 0, ...props }: StaggerProps) {
  const Component = containerTags[as];
  const each = count === undefined ? staggerTokens.each : staggerDelay(count);
  return (
    <Component
      initial="hidden"
      animate="shown"
      variants={{ hidden: {}, shown: { transition: { staggerChildren: each, delayChildren: delay } } }}
      {...props}
    />
  );
}

/** One child of Stagger. Renders its own element, so keep transition-* classes off it. */
export function StaggerItem({ as = "div", ...props }: StaggerItemProps) {
  const Component = itemTags[as];
  return <Component variants={itemVariants} {...props} />;
}
