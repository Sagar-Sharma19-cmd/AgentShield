import { Ban, CircleCheck, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { TOOL_STATUS_LABELS } from "@/lib/tools/model";
import type { ToolStatus } from "@/types/api";

/** Icon and text carry the status; colour only reinforces it. */
const STYLES: Record<ToolStatus, { icon: LucideIcon; tone: string }> = {
  ACTIVE: { icon: CircleCheck, tone: "border-success/30 bg-success/10 text-success-text" },
  DISABLED: { icon: Ban, tone: "border-border bg-muted text-muted-foreground" },
};

export function ToolStatusBadge({ status, className }: { status: ToolStatus; className?: string }) {
  const { icon: Icon, tone } = STYLES[status];
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center gap-1.5 whitespace-nowrap rounded-md border px-2 text-xs font-medium",
        tone,
        className,
      )}
    >
      <Icon aria-hidden="true" className="size-3.5 shrink-0" />
      {TOOL_STATUS_LABELS[status]}
    </span>
  );
}
