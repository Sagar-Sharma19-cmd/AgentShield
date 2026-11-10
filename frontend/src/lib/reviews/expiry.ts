/**
 * Expiry and age wording for reviews. Pure; tested in expiry.test.ts.
 *
 * The backend computes `expired` when it builds a response, so between polls a review can pass its
 * `expiresAt` while the cached flag still says false. For anything that decides whether an action is
 * OFFERED, the console therefore treats a review as expired when either the backend flag is set or the
 * local clock is past `expiresAt`. Hiding an action early is safe; the backend refuses it anyway (409).
 */
import { formatTimestamp } from "@/lib/format";
import type { ReviewRequestResponse } from "@/types/api";

/** Below this many minutes left, the countdown turns into a warning. */
export const EXPIRY_WARNING_MINUTES = 5;

/** The countdown re-renders at most this often, so screen readers are not flooded with updates. */
export const COUNTDOWN_TICK_MS = 30_000;

const MINUTE_MS = 60_000;

type ExpiryFields = Pick<ReviewRequestResponse, "expired" | "expiresAt">;

/** True when the backend says so, or the local clock is at or after expiresAt (matching isExpiredAt). */
export function isEffectivelyExpired(review: ExpiryFields, now: number): boolean {
  if (review.expired) return true;
  const expiresAt = Date.parse(review.expiresAt);
  return Number.isFinite(expiresAt) && now >= expiresAt;
}

/** "1 min", "12 min", "2 h", "2 h 5 min". Never "0 min": anything under a minute reads "under 1 min". */
export function formatDuration(ms: number): string {
  const minutes = Math.floor(Math.abs(ms) / MINUTE_MS);
  if (minutes < 1) return "under 1 min";
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}

export type ExpiryTone = "ok" | "warning" | "expired";

export interface ExpiryCountdown {
  tone: ExpiryTone;
  /** Short visible text: "expires in 12 min", "expired 3 min ago", "expired". */
  text: string;
  /** Full sentence for assistive technology, always including the exact expiry time. */
  label: string;
}

/**
 * Countdown for one review. `expired` comes from isEffectivelyExpired, so a review the backend marked
 * expired never shows a positive countdown even if the local clock is behind.
 */
export function expiryCountdown(review: ExpiryFields, now: number): ExpiryCountdown {
  const exact = formatTimestamp(review.expiresAt);
  const expiresAt = Date.parse(review.expiresAt);
  const known = Number.isFinite(expiresAt);

  if (isEffectivelyExpired(review, now)) {
    const ago = known && now >= expiresAt ? formatDuration(now - expiresAt) : null;
    return {
      tone: "expired",
      text: ago ? `expired ${ago} ago` : "expired",
      label: `Expired at ${exact}${ago ? `, ${ago} ago` : ""}.`,
    };
  }
  if (!known) {
    return { tone: "ok", text: "expiry unknown", label: `Expires at ${exact}.` };
  }
  const left = expiresAt - now;
  const tone: ExpiryTone = left < EXPIRY_WARNING_MINUTES * MINUTE_MS ? "warning" : "ok";
  return {
    tone,
    text: `expires in ${formatDuration(left)}`,
    label: `Expires at ${exact}, in ${formatDuration(left)}.`,
  };
}

/** "3 min ago", "2 h ago", "just now". Future timestamps (clock skew) read "just now". */
export function formatAge(iso: string, now: number): string {
  const at = Date.parse(iso);
  if (!Number.isFinite(at)) return iso;
  const ms = now - at;
  if (ms < MINUTE_MS) return "just now";
  return `${formatDuration(ms)} ago`;
}

/**
 * Why actions are not offered on an open review that has expired, e.g. "Expired 3 min ago. It can no
 * longer be started or decided; the agent must send the request again." Null if it has not expired.
 */
export function expiredReason(review: ExpiryFields, now: number): string | null {
  if (!isEffectivelyExpired(review, now)) return null;
  const countdown = expiryCountdown(review, now);
  const lead = countdown.text.charAt(0).toUpperCase() + countdown.text.slice(1);
  return `${lead}. It can no longer be started or decided; the agent must send the request again.`;
}
