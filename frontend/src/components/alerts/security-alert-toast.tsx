"use client";

import Link from "next/link";
import { DecisionBadge } from "@/components/security/decision-badge";
import { Button } from "@/components/ui/button";
import { formatTimestamp } from "@/lib/format";
import { ACTION_LABELS } from "@/lib/labels";
import type { SecurityAlert } from "@/lib/alerts/model";

/** Route to the audit detail. Activity opens the sheet for the `request` query parameter. */
export function alertDetailHref(requestId: string): string {
  return `/activity?request=${encodeURIComponent(requestId)}`;
}

const HEADLINE: Record<SecurityAlert["decision"], string> = {
  DENY: "Request denied",
  REVIEW: "Human review required",
};

/**
 * Non-blocking popup for one new alert. It is a sonner custom toast, so it does not take focus or
 * block the page. The text carries the meaning, and the decision badge carries its own label.
 */
export function SecurityAlertToast({ alert, onDismiss }: { alert: SecurityAlert; onDismiss: () => void }) {
  const actionLabel = alert.action ? ACTION_LABELS[alert.action] : "Unknown action";
  const agent = alert.agentId || "unknown agent";

  return (
    <div className="flex w-[min(92vw,22rem)] flex-col gap-2 rounded-lg border bg-popover p-4 text-popover-foreground shadow-lg">
      <div className="flex items-center justify-between gap-3">
        <DecisionBadge decision={alert.decision} />
        <time dateTime={alert.timestamp} className="font-mono text-xs tabular-nums text-muted-foreground">
          {formatTimestamp(alert.timestamp)}
        </time>
      </div>
      <p className="text-sm font-medium">{HEADLINE[alert.decision]}</p>
      <p className="truncate text-xs text-muted-foreground">
        <span className="font-mono">{agent}</span> · {actionLabel}
        {alert.tool ? <> · <span className="font-mono">{alert.tool}</span></> : null}
      </p>
      {alert.resource ? <p className="truncate font-mono text-xs">{alert.resource}</p> : null}
      {alert.reason ? <p className="line-clamp-2 text-xs text-muted-foreground">{alert.reason}</p> : null}
      <div className="mt-1 flex items-center justify-between gap-2">
        <Button asChild variant="ghost" size="sm">
          <Link href={alertDetailHref(alert.requestId)}>View event</Link>
        </Button>
        <Button variant="outline" size="sm" onClick={onDismiss}>
          Dismiss
        </Button>
      </div>
    </div>
  );
}

/** Summary popup for alerts beyond the per-popup limit. The feed holds the full list. */
export function SecurityAlertSummaryToast({ hiddenCount, onDismiss }: { hiddenCount: number; onDismiss: () => void }) {
  return (
    <div className="flex w-[min(92vw,22rem)] flex-col gap-2 rounded-lg border bg-popover p-4 text-popover-foreground shadow-lg">
      <p className="text-sm font-medium">
        {hiddenCount} more new {hiddenCount === 1 ? "alert" : "alerts"}
      </p>
      <p className="text-xs text-muted-foreground">They are listed in the live security alert feed on the Overview.</p>
      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={onDismiss}>
          Dismiss
        </Button>
      </div>
    </div>
  );
}
