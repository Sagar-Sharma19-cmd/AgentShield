"use client";

import { useId, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Kbd } from "@/components/shell/command-palette";
import { RiskTierBadge } from "@/components/security/risk-tier-badge";
import { isTypingTarget } from "@/lib/activity/table-model";
import { formatTimestamp } from "@/lib/format";
import { ACTION_LABELS } from "@/lib/labels";
import { durations, easings, springs } from "@/lib/motion/tokens";
import { formatAge } from "@/lib/reviews/expiry";
import { queueKey } from "@/lib/reviews/queue-keys";
import { reviewSignal } from "@/lib/reviews/signal";
import { cn } from "@/lib/utils";
import type { ReviewRequestResponse } from "@/types/api";
import { ExpiryCountdown } from "./expiry-countdown";
import { ReviewSignalMark } from "./review-signal";
import { ReviewStatusBadge } from "./review-status-badge";

interface ReviewQueueProps {
  reviews: ReviewRequestResponse[];
  /** Agent display names by agent id. Missing entries fall back to the raw agent id, never a guess. */
  agentNames: Map<string, string>;
  selectedId?: string;
  now: number;
  label: string;
  /** Show the shortcuts that change a review (S/A/R). Off on the decided and expired tabs. */
  actionable: boolean;
  onOpen: (id: string) => void;
  /** Opens the existing confirmation dialog for this review. Never performs the action. */
  onConfirm: (id: string, action: "approve" | "reject") => void;
  onStart: (review: ReviewRequestResponse) => void;
}

function dialogIsOpen(): boolean {
  return document.querySelector('[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]') !== null;
}

/**
 * The queue as a keyboard listbox with one tab stop: J/K (or arrows) move, Enter opens, S starts,
 * A/R open the approve/reject confirmation. Rows are also clickable. When a review leaves this tab
 * (for example after an approval), its row fades out and the rest close the gap with a layout spring.
 * Under reduced motion, MotionConfig drops the layout movement and only the fade remains.
 */
export function ReviewQueue({ reviews, agentNames, selectedId, now, label, actionable, onOpen, onConfirm, onStart }: ReviewQueueProps) {
  const baseId = useId();
  const hintId = useId();
  const [activeId, setActiveId] = useState<string | undefined>(selectedId);
  const [hint, setHint] = useState("");
  const [seenSelected, setSeenSelected] = useState(selectedId);

  // Opening a review elsewhere (click, deep link) moves the highlight to it.
  if (selectedId !== seenSelected) {
    setSeenSelected(selectedId);
    if (selectedId) setActiveId(selectedId);
  }

  const found = reviews.findIndex((review) => review.id === activeId);
  const active = found >= 0 ? found : 0;
  const optionId = (id: string) => `${baseId}-${id}`;

  function onKeyDown(event: React.KeyboardEvent<HTMLUListElement>) {
    // The queue is itself a listbox, which isTypingTarget counts as a typing widget, so only check
    // targets nested inside it.
    const nested = event.target !== event.currentTarget;
    const result = queueKey(event, reviews, active, {
      typing: nested && isTypingTarget(event.target as HTMLElement),
      dialogOpen: dialogIsOpen(),
      now,
    });
    if (result.kind === "none") return;
    event.preventDefault();
    setHint("");
    switch (result.kind) {
      case "move": {
        const next = reviews[result.index];
        setActiveId(next.id);
        document.getElementById(optionId(next.id))?.scrollIntoView({ block: "nearest" });
        break;
      }
      case "open":
        onOpen(result.reviewId);
        break;
      case "confirm":
        onConfirm(result.reviewId, result.action);
        break;
      case "start": {
        const review = reviews.find((item) => item.id === result.reviewId);
        if (review) onStart(review);
        break;
      }
      case "explain":
        setHint(result.message);
        break;
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <ul
        role="listbox"
        tabIndex={0}
        aria-label={`${label}. J and K move, Enter opens${actionable ? ", S starts, A approves and R rejects after confirmation" : ""}.`}
        aria-activedescendant={reviews[active] ? optionId(reviews[active].id) : undefined}
        aria-describedby={hintId}
        onKeyDown={onKeyDown}
        className="flex flex-col overflow-hidden rounded-lg border border-border bg-card outline-none focus-visible:ring-3 focus-visible:ring-ring/60"
      >
        <AnimatePresence initial={false}>
          {reviews.map((review, index) => (
            <motion.li
              key={review.id}
              layout="position"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ opacity: { duration: durations.base, ease: easings.standard }, layout: springs.layout }}
              id={optionId(review.id)}
              role="option"
              aria-selected={index === active}
              onClick={() => {
                setActiveId(review.id);
                onOpen(review.id);
              }}
              className="border-b border-border last:border-b-0"
            >
              <QueueRow
                review={review}
                agentName={agentNames.get(review.agentId)}
                active={index === active}
                open={review.id === selectedId}
                now={now}
              />
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>

      <div className="hidden flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground sm:flex" aria-hidden="true">
        <span><Kbd>J</Kbd> <Kbd>K</Kbd> move</span>
        <span><Kbd>↵</Kbd> open</span>
        {actionable ? (
          <>
            <span><Kbd>S</Kbd> start</span>
            <span><Kbd>A</Kbd> approve</span>
            <span><Kbd>R</Kbd> reject</span>
          </>
        ) : null}
      </div>
      {actionable ? (
        <p className="hidden text-xs text-muted-foreground sm:block">A and R open a confirmation. Nothing is decided without it.</p>
      ) : null}
      <p id={hintId} role="status" className={cn("text-xs text-warning-text", !hint && "sr-only")}>
        {hint}
      </p>
    </div>
  );
}

function QueueRow({
  review,
  agentName,
  active,
  open,
  now,
}: {
  review: ReviewRequestResponse;
  agentName: string | undefined;
  active: boolean;
  open: boolean;
  now: number;
}) {
  return (
    <div
      className={cn(
        "relative flex cursor-pointer flex-col gap-1.5 px-3 py-2.5 transition-colors duration-150 motion-reduce:transition-none",
        open ? "bg-muted" : active ? "bg-muted/60" : "hover:bg-muted/40",
      )}
    >
      {active ? <span aria-hidden="true" className="absolute inset-y-2 left-0 w-[3px] rounded-full bg-primary" /> : null}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="min-w-0 truncate text-sm">
          <span className="font-medium">{ACTION_LABELS[review.action]}</span>
          <span className="text-muted-foreground"> with </span>
          <span className="font-mono text-xs">{review.tool}</span>
        </p>
        <span className="flex items-center gap-1.5">
          {open ? <span className="font-mono text-[0.625rem] tracking-wide text-muted-foreground uppercase">Open</span> : null}
          <ReviewStatusBadge status={review.status} />
        </span>
      </div>
      <p className="truncate font-mono text-xs text-muted-foreground" title={review.resource}>
        <span className="sr-only">Resource </span>
        {review.resource}
      </p>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
        <RiskTierBadge tier={review.riskTier} className="h-5 px-1.5 text-[0.6875rem]" />
        <span className="font-mono tabular-nums">
          <span className="sr-only">Effective score </span>
          {review.riskScore}
          <span className="text-muted-foreground">/100</span>
        </span>
        <ReviewSignalMark signal={reviewSignal(review)} className="text-muted-foreground" />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span className="min-w-0 truncate">
          <span className="sr-only">Agent </span>
          {agentName ?? <span className="font-mono">{review.agentId}</span>}
          <span aria-hidden="true"> · </span>
          <time dateTime={review.createdAt} title={formatTimestamp(review.createdAt)}>
            <span className="sr-only">created </span>
            {formatAge(review.createdAt, now)}
          </time>
        </span>
        {review.status === "PENDING" || review.status === "IN_REVIEW" || (review.status === "APPROVED" && !review.consumedAt) ? (
          <ExpiryCountdown review={review} now={now} />
        ) : review.consumedAt ? (
          <span>Claimed</span>
        ) : null}
      </div>
    </div>
  );
}
