import { cn } from "@/lib/utils";

/**
 * Shows a 0–100 risk score (Activity passes the effective score) as a number and a proportional bar. It shows no
 * LOW/HIGH label: the Risk Engine's tier, when recorded, is shown next to it with RiskTierBadge.
 */
export function RiskScore({ score, className }: { score: number; className?: string }) {
  const clamped = Math.min(100, Math.max(0, score));

  return (
    <div className={cn("flex items-center gap-3", className)}>
      <span className="font-mono text-sm tabular-nums">
        <span className="font-medium text-foreground">{score}</span>
        <span className="text-muted-foreground">/100</span>
      </span>
      <div
        role="meter"
        aria-label="Risk score"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={clamped}
        aria-valuetext={`${score} out of 100`}
        className="h-1.5 w-20 overflow-hidden rounded-full bg-muted"
      >
        <div className="h-full rounded-full bg-foreground/60" style={{ width: `${clamped}%` }} />
      </div>
    </div>
  );
}
