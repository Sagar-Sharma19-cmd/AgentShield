import { Check, CircleDashed, CircleHelp, Minus, ShieldAlert } from "lucide-react";
import { GateIcon } from "@/components/checkpoint/gate-mark";
import { DecisionIcon } from "@/components/checkpoint/decision-mark";
import { decisionPath, STEP_STATUS_LABELS, type PathInput, type ReviewOutcome, type StepStatus } from "@/lib/activity/decision-path";
import { GATE_LABELS } from "@/lib/checkpoint/gates";
import { cn } from "@/lib/utils";
import type { DecisionType } from "@/types/api";

/** Status as an icon plus text; colour only reinforces it. */
function StatusIcon({ status, decision }: { status: StepStatus; decision: DecisionType }) {
  switch (status) {
    case "decided":
      return <DecisionIcon decision={decision} className="size-4" />;
    case "decided-after-review":
      // The operator's approval let the held request go ahead: the same mark as an allowed decision.
      return <DecisionIcon decision="ALLOW" className="size-4" />;
    case "passed":
      return <Check aria-hidden="true" className="size-4 text-success-text" />;
    case "evaluated":
      return <Minus aria-hidden="true" className="size-4 text-muted-foreground" />;
    case "not-recorded":
      return <CircleHelp aria-hidden="true" className="size-4 text-muted-foreground" />;
    case "not-reached":
      return <CircleDashed aria-hidden="true" className="size-4 text-muted-foreground/70" />;
  }
}

/**
 * The six gates as a vertical timeline. Each step says what the record shows about that gate; the
 * deciding step is emphasised and carries the backend's own reason text. The review detail passes the
 * review's outcome, so a held request's final step says what the operator and the agent did.
 */
export function DecisionPath({ event, reviewOutcome }: { event: PathInput; reviewOutcome?: ReviewOutcome }) {
  const steps = decisionPath(reviewOutcome ? { ...event, reviewOutcome } : event);

  return (
    <ol className="flex flex-col" aria-label="Decision path through the gateway">
      {steps.map((step, index) => {
        const decided = step.status === "decided" || step.status === "decided-after-review";
        const faded = step.status === "not-reached";
        const last = index === steps.length - 1;
        return (
          <li key={step.gate} aria-current={step.status === "decided" ? "step" : undefined} className="grid grid-cols-[1.75rem_1fr] gap-x-3">
            <div className="flex flex-col items-center">
              <span
                className={cn(
                  "flex size-7 shrink-0 items-center justify-center rounded-full border bg-card",
                  decided ? "border-foreground" : "border-border",
                  faded && "border-dashed",
                )}
              >
                <StatusIcon status={step.status} decision={event.decision} />
              </span>
              {!last ? (
                <span aria-hidden="true" className={cn("my-1 w-px flex-1", faded ? "border-l border-dashed border-border" : "bg-border")} />
              ) : null}
            </div>
            <div className={cn("flex min-w-0 flex-col gap-1 pt-1", last ? "pb-0" : "pb-4", faded && "text-muted-foreground")}>
              <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                <span className="inline-flex items-center gap-1.5 font-medium">
                  <GateIcon gate={step.gate} className="text-muted-foreground" />
                  {step.gate === "PASSED" ? "Decision" : GATE_LABELS[step.gate]}
                </span>
                <span
                  className={cn(
                    "rounded-md border px-1.5 py-0.5 font-mono text-[0.6875rem] tracking-wide uppercase",
                    decided ? "border-foreground/60 text-foreground" : "border-border text-muted-foreground",
                  )}
                >
                  {STEP_STATUS_LABELS[step.status]}
                </span>
              </p>
              {step.failedSafe ? (
                // Never-Alone: the HIGH tier's icon with the words; the tone only reinforces it.
                <p className="inline-flex items-center gap-1.5 text-xs leading-relaxed font-medium text-risk-high-text">
                  <ShieldAlert aria-hidden="true" className="size-3.5 shrink-0" />
                  {step.note}
                </p>
              ) : (
                <p className={cn("text-xs leading-relaxed", decided ? "text-foreground" : "text-muted-foreground")}>{step.note}</p>
              )}
              {step.detail ? (
                <div className="mt-1 rounded-md border border-border bg-muted/40 px-3 py-2 text-sm leading-relaxed">
                  <span className="sr-only">
                    {step.detail.kind === "authorization-reason" ? "Authorization reason: " : "Reason: "}
                  </span>
                  {step.detail.text}
                </div>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
