"use client";

import { RiskTierBadge } from "@/components/security/risk-tier-badge";
import { RiskScore } from "@/components/security/risk-score";
import { formatTimestamp } from "@/lib/format";
import { ACTION_LABELS } from "@/lib/labels";
import { cn } from "@/lib/utils";
import type { ReviewRequestResponse } from "@/types/api";

interface ReviewQueueProps {
  reviews: ReviewRequestResponse[];
  /** Agent display names by agent id. Missing entries fall back to the raw agent id, never a guess. */
  agentNames: Map<string, string>;
  selectedId?: string;
  onSelect: (id: string) => void;
}

/**
 * One row per review. Each row is a real button, so keyboard and screen-reader users get the same
 * selection behaviour as pointer users. Rows stack on every breakpoint instead of shrinking a table.
 */
export function ReviewQueue({ reviews, agentNames, selectedId, onSelect }: ReviewQueueProps) {
  return (
    <ul className="flex flex-col gap-2" aria-label="Reviews">
      {reviews.map((review) => {
        const selected = review.id === selectedId;
        return (
          <li key={review.id}>
            <button
              type="button"
              onClick={() => onSelect(review.id)}
              aria-current={selected ? "true" : undefined}
              className={cn(
                "flex w-full flex-col gap-2.5 rounded-lg border bg-card p-3 text-left transition-colors duration-150 motion-reduce:transition-none hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:p-4",
                selected && "border-foreground/30 bg-muted",
              )}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <RiskTierBadge tier={review.riskTier} />
                <time dateTime={review.createdAt} className="font-mono text-xs tabular-nums text-muted-foreground">
                  {formatTimestamp(review.createdAt)}
                </time>
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">
                  {agentNames.get(review.agentId) ?? review.agentId}
                </p>
                <p className="truncate text-sm text-muted-foreground">
                  {ACTION_LABELS[review.action]}
                  <span> on </span>
                  <span className="font-mono text-xs text-foreground">{review.resource}</span>
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <span className="truncate">
                  Tool <span className="font-mono text-foreground">{review.tool}</span>
                </span>
                <RiskScore score={review.riskScore} />
              </div>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
