import { Ban, CircleCheck, Clock, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { DECISION_LABELS } from "@/lib/labels";
import type { DecisionType } from "@/types/api";

/**
 * Each decision is identified by icon and text first; the tone reinforces it. Colour alone never
 * carries the meaning.
 */
const DECISION_STYLES: Record<DecisionType, { icon: LucideIcon; tone: string }> = {
  ALLOW: {
    icon: CircleCheck,
    tone: "border-success/30 bg-success/10 text-success-text",
  },
  REVIEW: {
    icon: Clock,
    tone: "border-warning/50 bg-warning/20 text-warning-text",
  },
  DENY: {
    icon: Ban,
    tone: "border-danger/30 bg-danger/10 text-danger-text",
  },
};

export function DecisionBadge({ decision, className }: { decision: DecisionType; className?: string }) {
  const { icon: Icon, tone } = DECISION_STYLES[decision];

  return (
    <span
      className={cn(
        "inline-flex h-6 items-center gap-1.5 whitespace-nowrap rounded-md border px-2 text-xs font-medium",
        tone,
        className,
      )}
    >
      <Icon aria-hidden="true" className="size-3.5 shrink-0" />
      {DECISION_LABELS[decision]}
    </span>
  );
}
