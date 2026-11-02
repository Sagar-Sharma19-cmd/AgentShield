import { CircleCheck, Ban, Clock, Eye, type LucideIcon } from "lucide-react";
import { REVIEW_STATUS_LABELS } from "@/lib/reviews/model";
import { cn } from "@/lib/utils";
import type { ReviewStatus } from "@/types/api";

const STATUS_STYLES: Record<ReviewStatus, { icon: LucideIcon; tone: string }> = {
  PENDING: { icon: Clock, tone: "border-border bg-muted text-foreground" },
  IN_REVIEW: { icon: Eye, tone: "border-secondary-foreground/20 bg-secondary text-secondary-foreground" },
  APPROVED: { icon: CircleCheck, tone: "border-success/30 bg-success/10 text-success-text" },
  REJECTED: { icon: Ban, tone: "border-danger/30 bg-danger/10 text-danger-text" },
};

export function ReviewStatusBadge({ status, className }: { status: ReviewStatus; className?: string }) {
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
      {REVIEW_STATUS_LABELS[status]}
    </span>
  );
}
