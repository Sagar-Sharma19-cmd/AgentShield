import { CircleCheck, CircleDashed, CircleDot, CircleSlash, TimerOff, type LucideIcon } from "lucide-react";
import { formatTimestamp } from "@/lib/format";
import { reviewTimeline, TIMELINE_STATE_LABELS, type TimelineInput, type TimelineState } from "@/lib/reviews/timeline";
import { cn } from "@/lib/utils";

const STATE_MARKS: Record<TimelineState, { icon: LucideIcon; tone: string }> = {
  done: { icon: CircleCheck, tone: "text-success-text" },
  current: { icon: CircleDot, tone: "text-primary" },
  upcoming: { icon: CircleDashed, tone: "text-muted-foreground/70" },
  skipped: { icon: CircleSlash, tone: "text-muted-foreground" },
  expired: { icon: TimerOff, tone: "text-warning-text" },
};

/**
 * Created → In review → Decision → Agent claim, as a vertical list. Each step has an icon and a text
 * state label, so colour is never the only signal. Rules: lib/reviews/timeline.ts.
 */
export function ReviewTimeline({ review, now }: { review: TimelineInput; now: number }) {
  const steps = reviewTimeline(review, now);

  return (
    <ol className="flex flex-col" aria-label="Review timeline">
      {steps.map((step, index) => {
        const { icon: Icon, tone } = STATE_MARKS[step.state];
        const last = index === steps.length - 1;
        const faded = step.state === "upcoming" || step.state === "skipped";
        return (
          <li key={step.id} aria-current={step.state === "current" ? "step" : undefined} className="grid grid-cols-[1.75rem_1fr] gap-x-3">
            <div className="flex flex-col items-center">
              <span
                className={cn(
                  "flex size-7 shrink-0 items-center justify-center rounded-full border bg-card",
                  step.state === "current" ? "border-primary" : "border-border",
                  faded && "border-dashed",
                )}
              >
                <Icon aria-hidden="true" className={cn("size-4", tone)} />
              </span>
              {!last ? (
                <span aria-hidden="true" className={cn("my-1 w-px flex-1", faded ? "border-l border-dashed border-border" : "bg-border")} />
              ) : null}
            </div>
            <div className={cn("flex min-w-0 flex-col gap-1 pt-1", last ? "pb-0" : "pb-4", faded && "text-muted-foreground")}>
              <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                <span className="font-medium">{step.title}</span>
                <span className="rounded-md border border-border px-1.5 py-0.5 font-mono text-[0.6875rem] tracking-wide text-muted-foreground uppercase">
                  {TIMELINE_STATE_LABELS[step.state]}
                </span>
              </p>
              {step.at ? (
                <time dateTime={step.at} className="font-mono text-xs tabular-nums text-muted-foreground">
                  {formatTimestamp(step.at)}
                </time>
              ) : null}
              {step.detail ? <p className="text-xs leading-relaxed text-muted-foreground">{step.detail}</p> : null}
              {step.note ? (
                <blockquote className="mt-1 rounded-md border border-border bg-muted/40 px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap">
                  <span className="sr-only">Reviewer note: </span>
                  {step.note}
                </blockquote>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
