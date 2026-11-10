import { CircleHelp } from "lucide-react";
import { GateIcon } from "@/components/checkpoint/gate-mark";
import { REVIEW_SIGNAL_LABELS, type ReviewSignal } from "@/lib/reviews/signal";
import { cn } from "@/lib/utils";

/** Which signal sent the request to review, with the same gate icon the Overview uses, plus its label. */
export function ReviewSignalMark({ signal, className }: { signal: ReviewSignal; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1", className)}>
      {signal === "UNKNOWN" ? (
        <CircleHelp aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />
      ) : (
        <GateIcon gate={signal} className="text-muted-foreground" />
      )}
      <span className="sr-only">Escalated by </span>
      {REVIEW_SIGNAL_LABELS[signal]}
    </span>
  );
}
