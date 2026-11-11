"use client";

import { useEffect } from "react";
import Link from "next/link";
import { RotateCw, TriangleAlert } from "lucide-react";
import { useSecurityAlerts } from "@/components/alerts/security-alerts-context";
import { alertDetailHref } from "@/components/alerts/security-alert-toast";
import { DecisionBadge } from "@/components/security/decision-badge";
import { RiskScore } from "@/components/security/risk-score";
import { DashboardCard, SectionEmpty, SectionError, SectionSkeleton } from "@/components/dashboard/section-states";
import { Button } from "@/components/ui/button";
import type { SecurityAlert } from "@/lib/alerts/model";
import { ALERT_POLL_MS } from "@/lib/alerts/tracker";
import { formatTimestamp } from "@/lib/format";
import { ACTION_LABELS } from "@/lib/labels";
import { trajectoryEvidence } from "@/lib/trajectory/model";
import { TrajectoryEscalationBadge, TrajectorySummary } from "@/components/trajectory/trajectory-evidence";
import { useSecurityAlertFeed } from "@/lib/queries/alerts";
import { ApiError } from "@/lib/api/client";
import { ALERT_FEED_ID, focusAlertFeed } from "@/components/alerts/alert-feed-anchor";

/** Live feed of DENY and REVIEW decisions. Reads the monitor's cached query, so it adds no timer. */
export function SecurityAlertFeedCard() {
  const query = useSecurityAlertFeed();
  const { unreadIds, markAllRead } = useSecurityAlerts();
  const alerts = query.data ?? [];
  const unreadCount = unreadIds.size;

  // Arriving from the header indicator (/#security-alerts): move focus here, not only the scroll position.
  useEffect(() => {
    if (window.location.hash === `#${ALERT_FEED_ID}`) focusAlertFeed();
  }, []);

  return (
    <DashboardCard
      id={ALERT_FEED_ID}
      focusable
      title="Live security alerts"
      description={`Denied and review-required requests. Refreshes every ${ALERT_POLL_MS / 1000} seconds. New events are marked until you mark them read.`}
      action={
        unreadCount > 0 ? (
          <Button variant="outline" size="sm" onClick={markAllRead}>
            Mark all read
          </Button>
        ) : null
      }
    >
      {query.isPending ? (
        <SectionSkeleton label="Loading security alerts" rows={3} />
      ) : query.isError && query.data === undefined ? (
        <SectionError error={query.error} onRetry={() => void query.refetch()} subject="security alerts" />
      ) : (
        <div className="flex flex-col gap-3">
          {query.isError ? <RefreshWarning error={query.error} onRetry={() => void query.refetch()} /> : null}
          {alerts.length === 0 ? (
            <SectionEmpty
              title="No alerts"
              body="Denied and review-required requests appear here as soon as the gateway records them."
            />
          ) : (
            <ul className="flex flex-col divide-y" aria-label="Security alerts, newest first">
              {alerts.map((alert) => (
                <AlertRow key={alert.requestId} alert={alert} unread={unreadIds.has(alert.requestId)} />
              ))}
            </ul>
          )}
        </div>
      )}
    </DashboardCard>
  );
}

/** Shown when a refresh fails but the last good list is still on screen. The page is not blanked. */
function RefreshWarning({ error, onRetry }: { error: Error; onRetry: () => void }) {
  const rejected = error instanceof ApiError && (error.status === 401 || error.status === 403);

  return (
    <div role="status" className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-warning/50 bg-warning/10 px-3 py-2 text-xs">
      <span className="flex items-center gap-2 text-warning-text">
        <TriangleAlert aria-hidden="true" className="size-3.5 shrink-0" />
        {rejected
          ? "Alert updates stopped: AgentShield rejected the admin key. Lock and re-enter it."
          : "Could not refresh alerts. Showing the last result."}
      </span>
      {!rejected ? (
        <Button variant="ghost" size="sm" onClick={onRetry}>
          <RotateCw aria-hidden="true" />
          Retry
        </Button>
      ) : null}
    </div>
  );
}

function AlertRow({ alert, unread }: { alert: SecurityAlert; unread: boolean }) {
  const actionLabel = alert.action ? ACTION_LABELS[alert.action] : "Unknown action";
  const agent = alert.agentId || "unknown agent";

  return (
    <li>
      <Link
        href={alertDetailHref(alert.requestId)}
        className="flex flex-col gap-1.5 rounded-md py-3 transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <DecisionBadge decision={alert.decision} />
            {unread ? (
              <span className="rounded-md bg-foreground px-1.5 py-0.5 text-[0.7rem] font-medium uppercase tracking-wide text-background">
                New
              </span>
            ) : null}
            <TrajectoryEscalationBadge escalatedBy={alert.escalatedBy} />
          </div>
          <time dateTime={alert.timestamp} className="font-mono text-xs tabular-nums text-muted-foreground">
            {formatTimestamp(alert.timestamp)}
          </time>
        </div>
        <p className="truncate text-sm">
          <span className="font-mono text-xs">{agent}</span>
          <span className="text-muted-foreground"> · {actionLabel}</span>
          {alert.tool ? <span className="font-mono text-xs text-muted-foreground"> · {alert.tool}</span> : null}
        </p>
        {alert.resource ? <p className="truncate font-mono text-xs text-muted-foreground">{alert.resource}</p> : null}
        {alert.reason ? <p className="line-clamp-2 text-xs text-muted-foreground">{alert.reason}</p> : null}
        {alert.policyRiskScore !== null ? (
          <div className="pt-0.5">
            <span className="mr-2 text-xs text-muted-foreground">Policy risk</span>
            <RiskScore score={alert.policyRiskScore} />
          </div>
        ) : null}
        <TrajectorySummary
          evidence={trajectoryEvidence({
            trajectoryScore: alert.trajectoryScore,
            trajectoryTier: alert.trajectoryTier,
            trajectoryReason: alert.trajectoryReason,
          })}
        />
      </Link>
    </li>
  );
}
