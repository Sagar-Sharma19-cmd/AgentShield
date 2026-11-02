"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { useSecurityAlerts } from "@/components/alerts/security-alerts-context";
import { SecurityAlertSummaryToast, SecurityAlertToast } from "@/components/alerts/security-alert-toast";
import { EMPTY_TRACKER, planNotifications, type AlertTracker } from "@/lib/alerts/tracker";
import { useSecurityAlertFeed } from "@/lib/queries/alerts";

/** How long each popup stays before it clears itself. The operator can dismiss it sooner. */
const TOAST_DURATION_MS = 12_000;

/**
 * Watches the alert feed and announces new alerts. It renders nothing. Mount exactly one instance
 * per console session, inside the admin-gated shell, so the poll loop and the announcement state
 * are not duplicated.
 */
export function SecurityAlertsMonitor() {
  const query = useSecurityAlertFeed({ poll: true });
  const { markUnread } = useSecurityAlerts();
  const trackerRef = useRef<AlertTracker>(EMPTY_TRACKER);

  useEffect(() => {
    if (!query.data) return;

    // Idempotent for unchanged data: a repeat of the same response plans no new notifications,
    // which also covers React StrictMode running this effect twice in development.
    const plan = planNotifications(trackerRef.current, query.data);
    trackerRef.current = plan.tracker;
    if (plan.fresh.length === 0) return;

    markUnread(plan.fresh.map((alert) => alert.requestId));

    for (const alert of plan.toShow) {
      // Using the requestId as the toast id makes sonner replace, not stack, a repeat of the same alert.
      toast.custom((id) => <SecurityAlertToast alert={alert} onDismiss={() => toast.dismiss(id)} />, {
        id: `alert-${alert.requestId}`,
        duration: TOAST_DURATION_MS,
      });
    }

    if (plan.hiddenCount > 0) {
      toast.custom((id) => <SecurityAlertSummaryToast hiddenCount={plan.hiddenCount} onDismiss={() => toast.dismiss(id)} />, {
        id: `alerts-summary-${plan.fresh[plan.fresh.length - 1].requestId}`,
        duration: TOAST_DURATION_MS,
      });
    }
  }, [query.data, markUnread]);

  return null;
}
