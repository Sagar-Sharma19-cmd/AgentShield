import { Timer, TimerOff, TriangleAlert } from "lucide-react";
import { expiryCountdown, type ExpiryTone } from "@/lib/reviews/expiry";
import { cn } from "@/lib/utils";
import type { ReviewRequestResponse } from "@/types/api";

const TONES: Record<ExpiryTone, { icon: typeof Timer; className: string }> = {
  ok: { icon: Timer, className: "text-muted-foreground" },
  warning: { icon: TriangleAlert, className: "font-medium text-warning-text" },
  expired: { icon: TimerOff, className: "text-muted-foreground" },
};

/**
 * "expires in 12 min" / "expires in 3 min" (warning icon + tone) / "expired 3 min ago". The exact expiry
 * time is in the screen-reader text and the hover title. It is not a live region: it re-renders with the
 * page clock (every 30 s), and the action area announces the change that matters (expiry) once.
 */
export function ExpiryCountdown({
  review,
  now,
  className,
}: {
  review: Pick<ReviewRequestResponse, "expired" | "expiresAt">;
  now: number;
  className?: string;
}) {
  const countdown = expiryCountdown(review, now);
  const { icon: Icon, className: tone } = TONES[countdown.tone];
  return (
    <span className={cn("inline-flex items-center gap-1 tabular-nums", tone, className)} title={countdown.label}>
      <Icon aria-hidden="true" className="size-3.5 shrink-0" />
      <span aria-hidden="true">{countdown.text}</span>
      <span className="sr-only">{countdown.label}</span>
    </span>
  );
}
