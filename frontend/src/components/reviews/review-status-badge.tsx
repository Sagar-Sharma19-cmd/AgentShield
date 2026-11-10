"use client";

import { motion } from "motion/react";
import { CircleCheck, Ban, Clock, Eye, TimerOff, type LucideIcon } from "lucide-react";
import { durations, easings } from "@/lib/motion/tokens";
import { REVIEW_STATUS_LABELS } from "@/lib/reviews/model";
import { cn } from "@/lib/utils";
import type { ReviewStatus } from "@/types/api";

const STATUS_STYLES: Record<ReviewStatus, { icon: LucideIcon; tone: string }> = {
  PENDING: { icon: Clock, tone: "border-border bg-muted text-foreground" },
  IN_REVIEW: { icon: Eye, tone: "border-secondary-foreground/20 bg-secondary text-secondary-foreground" },
  APPROVED: { icon: CircleCheck, tone: "border-success/30 bg-success/10 text-success-text" },
  REJECTED: { icon: Ban, tone: "border-danger/30 bg-danger/10 text-danger-text" },
};

const EXPIRED_STYLE = { icon: TimerOff, tone: "border-warning/50 bg-warning/15 text-warning-text", label: "Expired" };

/**
 * Status chip: icon plus label. When the status changes in place (after an action or a refetch) it
 * fades in (opacity only, `fast`), so the new state is readable on the first frame and nothing moves.
 */
export function ReviewStatusBadge({ status, className }: { status: ReviewStatus; className?: string }) {
  const { icon: Icon, tone } = STATUS_STYLES[status];
  return (
    <motion.span
      key={status}
      initial={{ opacity: 0.4 }}
      animate={{ opacity: 1 }}
      transition={{ duration: durations.fast, ease: easings.standard }}
      className={cn(
        "inline-flex h-6 items-center gap-1.5 whitespace-nowrap rounded-md border px-2 text-xs font-medium",
        tone,
        className,
      )}
    >
      <Icon aria-hidden="true" className="size-3.5 shrink-0" />
      {REVIEW_STATUS_LABELS[status]}
    </motion.span>
  );
}

/**
 * The review's state as a "stamp" for the detail header: icon plus mono uppercase label. An open review
 * that expired reads "Expired" instead of its status, because it can no longer be acted on. Fades in
 * place on change, like the badge.
 */
export function ReviewStamp({ status, expired, className }: { status: ReviewStatus; expired: boolean; className?: string }) {
  const open = status === "PENDING" || status === "IN_REVIEW";
  const showExpired = open && expired;
  const { icon: Icon, tone } = showExpired ? EXPIRED_STYLE : STATUS_STYLES[status];
  const label = showExpired ? EXPIRED_STYLE.label : REVIEW_STATUS_LABELS[status];

  return (
    <motion.span
      key={label}
      initial={{ opacity: 0.4 }}
      animate={{ opacity: 1 }}
      transition={{ duration: durations.fast, ease: easings.standard }}
      className={cn(
        "inline-flex h-7 items-center gap-1.5 whitespace-nowrap rounded-md border-2 px-2.5 font-mono text-[0.6875rem] font-semibold tracking-[0.08em] uppercase",
        tone,
        className,
      )}
    >
      <Icon aria-hidden="true" className="size-3.5 shrink-0" />
      <span className="sr-only">Status: </span>
      {label}
    </motion.span>
  );
}
