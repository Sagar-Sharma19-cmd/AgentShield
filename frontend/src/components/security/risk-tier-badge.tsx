import { Flame, ShieldAlert, ShieldCheck, ShieldHalf, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { RiskTier } from "@/types/api";

const TIER_STYLES: Record<RiskTier, { icon: LucideIcon; label: string; tone: string }> = {
  LOW: { icon: ShieldCheck, label: "Low risk", tone: "border-success/30 bg-success/10 text-success-text" },
  MEDIUM: { icon: ShieldHalf, label: "Medium risk", tone: "border-warning/50 bg-warning/20 text-warning-text" },
  HIGH: { icon: ShieldAlert, label: "High risk", tone: "border-risk-high/40 bg-risk-high/12 text-risk-high-text" },
  CRITICAL: { icon: Flame, label: "Critical risk", tone: "border-danger/60 bg-danger/20 text-danger-text" },
};

/** Risk Engine tier. The icon and text carry the meaning; the tone only reinforces it. */
export function RiskTierBadge({ tier, className }: { tier: RiskTier; className?: string }) {
  const { icon: Icon, label, tone } = TIER_STYLES[tier];
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center gap-1.5 whitespace-nowrap rounded-md border px-2 text-xs font-medium",
        tone,
        className,
      )}
    >
      <Icon aria-hidden="true" className="size-3.5 shrink-0" />
      {label}
    </span>
  );
}
