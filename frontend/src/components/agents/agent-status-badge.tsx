import { Ban, CircleCheck, CirclePause, type LucideIcon } from "lucide-react";
import { AGENT_STATUS_LABELS } from "@/lib/labels";
import { cn } from "@/lib/utils";
import type { AgentStatus } from "@/types/api";

/** Icon and text carry the status; colour is supporting only. */
const STATUS_STYLES: Record<AgentStatus, { icon: LucideIcon; tone: string }> = {
  ACTIVE: { icon: CircleCheck, tone: "border-success/30 bg-success/10 text-success-text" },
  SUSPENDED: { icon: CirclePause, tone: "border-warning/30 bg-warning/10 text-warning-text" },
  REVOKED: { icon: Ban, tone: "border-danger/30 bg-danger/10 text-danger-text" },
};

export function AgentStatusBadge({ status, className }: { status: AgentStatus; className?: string }) {
  const { icon: Icon, tone } = STATUS_STYLES[status];
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center gap-1.5 whitespace-nowrap rounded-md border px-2 text-xs font-medium",
        tone,
        className,
      )}
    >
      <Icon aria-hidden="true" className="size-3.5 shrink-0" />
      {AGENT_STATUS_LABELS[status]}
    </span>
  );
}
