/**
 * The Overview's live alert feed as a link target. The header alert indicator links to `/#security-alerts`.
 * Next.js scrolls to a hash but does not move focus, so the feed card calls focusAlertFeed when it mounts with
 * that hash, and the indicator calls it directly when the Overview is already open.
 */
export const ALERT_FEED_ID = "security-alerts";
export const ALERT_FEED_HREF = `/#${ALERT_FEED_ID}`;

export function focusAlertFeed(): boolean {
  const element = document.getElementById(ALERT_FEED_ID);
  if (!element) return false;
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  element.scrollIntoView({ block: "start", behavior: reduced ? "auto" : "smooth" });
  element.focus({ preventScroll: true });
  return true;
}
