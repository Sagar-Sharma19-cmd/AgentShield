import {
  Ban,
  CircleCheck,
  CircleDashed,
  CircleDot,
  CircleMinus,
  CircleQuestionMark,
  CircleX,
  Clock,
  Hourglass,
  TimerOff,
  UserCheck,
  type LucideIcon,
} from "lucide-react";
import { RUN_STATUS_META, STEP_STATUS_META, type RunStatus, type StatusTone, type StepStatus } from "@/lib/pipeline/runs";
import { cn } from "@/lib/utils";

/** Text tone per status family. Every status also has its own icon shape and a label, so tone never stands alone. */
export const TONE_TEXT: Record<StatusTone, string> = {
  success: "text-success-text",
  warning: "text-warning-text",
  danger: "text-danger-text",
  muted: "text-muted-foreground",
};

export const STEP_ICONS: Record<StepStatus, LucideIcon> = {
  EXECUTED: CircleCheck,
  APPROVED_EXECUTED: UserCheck,
  WAITING: Clock,
  APPROVED_UNCLAIMED: Hourglass,
  REVIEW_UNKNOWN: CircleQuestionMark,
  REJECTED: CircleX,
  EXPIRED: TimerOff,
  BLOCKED: Ban,
  SKIPPED: CircleMinus,
  NOT_STARTED: CircleDashed,
};

export const RUN_ICONS: Record<RunStatus, LucideIcon> = {
  SUCCEEDED: CircleCheck,
  WAITING: Clock,
  BLOCKED: Ban,
  REJECTED: CircleX,
  EXPIRED: TimerOff,
  RUNNING: CircleDot,
};

export function StepStatusMark({ status, className }: { status: StepStatus; className?: string }) {
  const { label, tone } = STEP_STATUS_META[status];
  const Icon = STEP_ICONS[status];
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-xs font-medium", TONE_TEXT[tone], className)}>
      <Icon aria-hidden="true" className="size-4 shrink-0" />
      {label}
    </span>
  );
}

export function RunStatusMark({ status, className }: { status: RunStatus; className?: string }) {
  const { label, tone } = RUN_STATUS_META[status];
  const Icon = RUN_ICONS[status];
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-xs font-medium", TONE_TEXT[tone], className)}>
      <Icon aria-hidden="true" className="size-3.5 shrink-0" />
      {label}
    </span>
  );
}

/** Small per-step icons for the run list. Decorative: the list item carries the run status and a step count in text. */
export function StepDots({ statuses }: { statuses: readonly StepStatus[] }) {
  return (
    <span aria-hidden="true" className="flex items-center gap-1">
      {statuses.map((status, index) => {
        const Icon = STEP_ICONS[status];
        return <Icon key={index} className={cn("size-3 shrink-0", TONE_TEXT[STEP_STATUS_META[status].tone])} />;
      })}
    </span>
  );
}
