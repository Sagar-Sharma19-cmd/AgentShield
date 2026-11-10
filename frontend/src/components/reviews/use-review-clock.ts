"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { COUNTDOWN_TICK_MS } from "@/lib/reviews/expiry";

/**
 * The local clock, re-read every COUNTDOWN_TICK_MS (30 s). Countdowns re-render only on this tick, so
 * their text (and what a screen reader can pick up from it) changes at most every 30 seconds.
 */
export function useNow(intervalMs: number = COUNTDOWN_TICK_MS): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(timer);
  }, [intervalMs]);
  return now;
}

/** Tailwind's `lg` breakpoint: from here the detail is a pane beside the queue instead of a sheet. */
const DESKTOP_QUERY = "(min-width: 1024px)";

function subscribe(onChange: () => void) {
  const media = window.matchMedia(DESKTOP_QUERY);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

/**
 * True at `lg` and above. False on the server, so the first client render may switch once; the review
 * detail is only rendered after client-side data arrives, so nothing visible flips.
 */
export function useIsDesktop(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(DESKTOP_QUERY).matches,
    () => false,
  );
}
