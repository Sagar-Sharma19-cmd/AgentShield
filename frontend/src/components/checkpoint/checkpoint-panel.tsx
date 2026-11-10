"use client";

import { useId } from "react";
import { cn } from "@/lib/utils";

/**
 * Frame for the Checkpoint sections: hairline border, a mono uppercase eyebrow, a title and an
 * optional action. Rendered as a labelled region so each section is a landmark for screen readers.
 */
export function CheckpointPanel({
  eyebrow,
  title,
  description,
  action,
  className,
  children,
}: {
  eyebrow: string;
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  const headingId = useId();
  return (
    <section
      aria-labelledby={headingId}
      className={cn("flex min-w-0 flex-col gap-4 rounded-xl border border-border bg-card p-4 text-card-foreground md:p-5", className)}
    >
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <MicroLabel>{eyebrow}</MicroLabel>
          <h2 id={headingId} className="font-heading text-base font-medium tracking-tight">
            {title}
          </h2>
          {description ? <p className="max-w-2xl text-sm text-muted-foreground">{description}</p> : null}
        </div>
        {action ? <div className="flex shrink-0 items-center gap-2">{action}</div> : null}
      </header>
      {children}
    </section>
  );
}

/** Mono uppercase label used for gate names, eyebrows and axis captions. */
export function MicroLabel({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <span className={cn("font-mono text-[0.6875rem] font-medium tracking-[0.08em] text-muted-foreground uppercase", className)}>
      {children}
    </span>
  );
}
