import { Ban, CircleCheck, Clock, type LucideIcon } from "lucide-react";
import { DECISION_LABELS } from "@/lib/labels";
import { cn } from "@/lib/utils";
import type { DecisionType } from "@/types/api";

/**
 * Decision as a shape plus a colour, the same icons DecisionBadge uses: a check for ALLOW, a clock
 * for REVIEW, a barred circle for DENY. Colour reinforces the shape; it never stands alone.
 */
export const DECISION_MARKS: Record<DecisionType, { icon: LucideIcon; tone: string; label: string }> = {
  ALLOW: { icon: CircleCheck, tone: "text-success-text", label: DECISION_LABELS.ALLOW },
  REVIEW: { icon: Clock, tone: "text-warning-text", label: DECISION_LABELS.REVIEW },
  DENY: { icon: Ban, tone: "text-danger-text", label: DECISION_LABELS.DENY },
};

export const DECISION_ORDER: readonly DecisionType[] = ["ALLOW", "REVIEW", "DENY"];

/** One decision icon, decorative (the surrounding control or text carries the name). */
export function DecisionIcon({ decision, className }: { decision: DecisionType; className?: string }) {
  const { icon: Icon, tone } = DECISION_MARKS[decision];
  return <Icon aria-hidden="true" className={cn("size-3.5 shrink-0", tone, className)} />;
}

/** Legend row: icon and label for each decision. */
export function DecisionLegend({ className }: { className?: string }) {
  return (
    <ul className={cn("flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground", className)} aria-label="Legend">
      {DECISION_ORDER.map((decision) => (
        <li key={decision} className="flex items-center gap-1.5">
          <DecisionIcon decision={decision} />
          {DECISION_MARKS[decision].label}
        </li>
      ))}
    </ul>
  );
}
