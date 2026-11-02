import { ApiError } from "@/lib/api/client";
import { type SecurityAlert, compareNewestFirst } from "./model";

/** Seconds between polls. Shorter than the 30 s dashboard refresh, because alerts should surface quickly. */
export const ALERT_POLL_MS = 10_000;
/** Delay after a transient failure (network or 5xx). Longer, so an outage does not produce a request storm. */
export const ALERT_BACKOFF_MS = 30_000;
/** Newest alerts shown as individual popups per batch. Any others are summarised in one popup. */
export const ALERT_TOAST_LIMIT = 3;

/**
 * What the tracker remembers between polls. `seen` holds the requestIds present in the most
 * recent successful response. It is pruned on every success, which is safe: an alert that has
 * fallen out of the newest-first window cannot re-enter it, because the window only holds newer rows.
 */
export interface AlertTracker {
  readonly baselined: boolean;
  readonly seen: ReadonlySet<string>;
}

export const EMPTY_TRACKER: AlertTracker = { baselined: false, seen: new Set() };

export interface NotificationPlan {
  tracker: AlertTracker;
  /** Newest new alerts to show as individual popups, newest first. */
  toShow: SecurityAlert[];
  /** New alerts beyond the popup limit. They appear in the feed, and are summarised in one popup. */
  hiddenCount: number;
  /** Every new alert, oldest first. Used to mark feed rows as unread. */
  fresh: SecurityAlert[];
}

/**
 * Pure decision: which alerts in this successful response are new and should be announced.
 *
 * - The first successful response is the baseline. Everything in it is recorded as seen, and
 *   nothing is announced. So opening the console does not replay history as notifications.
 * - Later responses announce only requestIds not seen before. A requestId that is already
 *   known never notifies again, so repeated polling does not duplicate notifications.
 * - Duplicate requestIds inside one response are announced at most once.
 */
export function planNotifications(tracker: AlertTracker, alerts: readonly SecurityAlert[]): NotificationPlan {
  const nextSeen = new Set(alerts.map((alert) => alert.requestId));
  const nextTracker: AlertTracker = { baselined: true, seen: nextSeen };

  if (!tracker.baselined) {
    return { tracker: nextTracker, toShow: [], hiddenCount: 0, fresh: [] };
  }

  const announced = new Set<string>();
  const fresh: SecurityAlert[] = [];
  for (const alert of alerts) {
    if (tracker.seen.has(alert.requestId) || announced.has(alert.requestId)) continue;
    announced.add(alert.requestId);
    fresh.push(alert);
  }

  fresh.sort(compareNewestFirst);
  const toShow = fresh.slice(0, ALERT_TOAST_LIMIT);
  return {
    tracker: nextTracker,
    toShow,
    hiddenCount: fresh.length - toShow.length,
    fresh: [...fresh].reverse(), // oldest first
  };
}

/**
 * Delay before the next poll, or null to stop polling.
 * - Success: the normal interval.
 * - Auth rejected (401/403): stop. Retrying cannot succeed, and the dashboard already offers a
 *   lock-and-re-enter recovery path.
 * - Any other failure (network, 5xx, malformed): back off, and keep polling.
 */
export function nextPollDelay(error: unknown): number | null {
  if (error === null || error === undefined) return ALERT_POLL_MS;
  if (error instanceof ApiError && (error.status === 401 || error.status === 403)) return null;
  return ALERT_BACKOFF_MS;
}
