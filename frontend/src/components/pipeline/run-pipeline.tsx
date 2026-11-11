"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { GateMark } from "@/components/checkpoint/gate-mark";
import { buildActivityHref, parseActivityParams } from "@/lib/activity/filters";
import { formatTimestamp } from "@/lib/format";
import { durations, easings } from "@/lib/motion/tokens";
import { MOCK_TOOLS, type PipelineScenario } from "@/lib/pipeline/catalog";
import {
  describeStep,
  diffSteps,
  runTitle,
  STEP_STATUS_META,
  type PipelineRun,
  type RunStatus,
  type RunStep,
  type StatusTone,
} from "@/lib/pipeline/runs";
import { buildWorkspaceHref, tabFor } from "@/lib/reviews/tabs";
import { cn } from "@/lib/utils";
import { BreakableText } from "@/components/breakable-text";
import { RunStatusMark, StepStatusMark } from "./status-marks";

const CARD_TONE: Record<StatusTone, string> = {
  success: "border-success/40 bg-card",
  warning: "border-warning/60 bg-warning/[0.07]",
  danger: "border-danger/45 bg-danger/[0.06]",
  muted: "border-dashed border-border bg-card/60",
};

const DONE = new Set(["EXECUTED", "APPROVED_EXECUTED"]);

interface Seen {
  key: string;
  signature: string;
  steps: RunStep[];
  /** Per step index, a counter bumped on each status change; it keys the highlight so only that card replays it. */
  flashes: Record<number, number>;
  message: string;
}

/**
 * The selected run as a pipeline of step cards. When a refetch changes a step's status, only that card
 * transitions (its colours, plus a short highlight) and the connector after it fills; the change is announced
 * in a polite live region. Switching runs resets the comparison, so nothing is announced on selection.
 */
export function RunPipeline({ run, steps, status }: { run: PipelineRun; steps: RunStep[]; status: RunStatus }) {
  const reducedMotion = useReducedMotion() ?? false;
  const signature = steps.map((step) => step.status).join(",");
  const [seen, setSeen] = useState<Seen>({ key: run.sessionId, signature, steps, flashes: {}, message: "" });

  // Compare with the last rendered snapshot during render (no effect), as React recommends for derived state.
  if (seen.key !== run.sessionId) {
    setSeen({ key: run.sessionId, signature, steps, flashes: {}, message: "" });
  } else if (seen.signature !== signature) {
    const changes = diffSteps(seen.steps, steps);
    const flashes = { ...seen.flashes };
    for (const change of changes) flashes[change.index] = (flashes[change.index] ?? 0) + 1;
    const message = changes
      .map((change) => describeStep(steps[change.index - 1]))
      .filter((text): text is string => text !== null)
      .join(" ");
    setSeen({ key: run.sessionId, signature, steps, flashes, message: message || seen.message });
  }

  const flashes = seen.key === run.sessionId ? seen.flashes : {};

  return (
    <section aria-labelledby="run-heading" className="flex flex-col gap-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <h2 id="run-heading" className="font-heading text-lg font-semibold tracking-tight">
            {runTitle(run)}
          </h2>
          <p className="font-mono text-xs break-all text-muted-foreground">{run.sessionId}</p>
          <p className="text-xs text-muted-foreground">
            Started <time dateTime={run.startedAt}>{formatTimestamp(run.startedAt)}</time>
            {run.lastActivityAt !== run.startedAt ? (
              <>
                {" · "}last request <time dateTime={run.lastActivityAt}>{formatTimestamp(run.lastActivityAt)}</time>
              </>
            ) : null}
          </p>
        </div>
        <RunStatusMark status={status} className="text-sm [&_svg]:size-4" />
      </header>

      {run.possiblyTruncated ? (
        <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
          This run is the oldest in the agent&apos;s latest 100 requests, so its first steps may be outside the sample and show
          as not recorded.
        </p>
      ) : null}

      {/* Sized by the pane, not the viewport: 1 column when narrow, 2 from 36rem, one row from 56rem. */}
      <div className="@container">
        <div
          role="list"
          aria-label={`${runTitle(run)} steps`}
          className="grid grid-cols-1 gap-6 @min-[36rem]:grid-cols-2 @min-[56rem]:auto-cols-fr @min-[56rem]:grid-flow-col @min-[56rem]:grid-cols-none"
        >
          {steps.map((step, i) => (
            <StepWithConnector
              key={step.index}
              step={step}
              position={i}
              last={i === steps.length - 1}
              flash={flashes[step.index] ?? 0}
              reducedMotion={reducedMotion}
            />
          ))}
        </div>
      </div>

      <p role="status" aria-live="polite" className="sr-only">
        {seen.message}
      </p>

      {run.scenario ? <ScenarioDetails scenario={run.scenario} /> : <UnknownPipelineNote slug={run.slug} />}
    </section>
  );
}

/**
 * A step card and the connector to the next step, drawn in the grid gap (1.5rem). One column: a vertical line
 * below. Two columns: a horizontal line from each left-column card to its right neighbour (the step number
 * carries the order across rows). One row: a horizontal line after every card. The fill scales on its own axis.
 */
function StepWithConnector({
  step,
  position,
  last,
  flash,
  reducedMotion,
}: {
  step: RunStep;
  position: number;
  last: boolean;
  flash: number;
  reducedMotion: boolean;
}) {
  const filled = DONE.has(step.status);
  const meta = STEP_STATUS_META[step.status];
  const fill = "absolute inset-0 bg-primary transition-transform duration-300 ease-out motion-reduce:transition-none";
  return (
    <div role="listitem" aria-label={`Step ${step.index}, ${step.tool}.${step.action.toLowerCase()}: ${meta.label}`} className="relative flex min-w-0">
      <StepCard step={step} flash={flash} reducedMotion={reducedMotion} />
      {last ? null : (
        <>
          <span aria-hidden="true" className="absolute top-full left-1/2 h-6 w-0.5 -translate-x-1/2 overflow-hidden rounded-full bg-border @min-[36rem]:hidden">
            <span className={cn(fill, "origin-top", filled ? "scale-y-100" : "scale-y-0")} />
          </span>
          <span
            aria-hidden="true"
            className={cn(
              "absolute top-1/2 left-full hidden h-0.5 w-6 -translate-y-1/2 overflow-hidden rounded-full bg-border @min-[56rem]:block",
              position % 2 === 0 && "@min-[36rem]:block",
            )}
          >
            <span className={cn(fill, "origin-left", filled ? "scale-x-100" : "scale-x-0")} />
          </span>
        </>
      )}
    </div>
  );
}

function StepCard({ step, flash, reducedMotion }: { step: RunStep; flash: number; reducedMotion: boolean }) {
  const meta = STEP_STATUS_META[step.status];
  const pending = step.status === "NOT_STARTED" || step.status === "SKIPPED";

  return (
    <div
      className={cn(
        "relative flex min-w-0 flex-1 flex-col gap-2 rounded-lg border p-3 transition-[color,background-color,border-color,opacity] duration-200 motion-reduce:transition-none",
        CARD_TONE[meta.tone],
        pending && "opacity-75",
      )}
    >
      {flash > 0 && !reducedMotion ? (
        <motion.span
          key={flash}
          aria-hidden="true"
          className="pointer-events-none absolute -inset-px rounded-lg ring-2 ring-primary/60"
          initial={{ opacity: 1 }}
          animate={{ opacity: 0 }}
          transition={{ duration: durations.slow, ease: easings.exit }}
        />
      ) : null}

      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-[0.6875rem] text-muted-foreground tabular-nums">{String(step.index).padStart(2, "0")}</span>
        <StepStatusMark status={step.status} />
      </div>

      <div className="flex flex-col gap-0.5">
        {/* Never truncated: it may wrap, but only after the dot. */}
        <p className="font-mono text-[0.8125rem] font-medium break-normal">
          {step.tool}.<wbr />
          {step.action.toLowerCase()}
        </p>
        {step.summary ? <p className="text-xs text-muted-foreground">{step.summary}</p> : null}
        <p className="min-h-[2lh] font-mono text-[0.6875rem] text-muted-foreground">
          <BreakableText text={step.resource} />
        </p>
      </div>

      {/* Fixed-height outcome slot, so a status change does not move the cards around it. */}
      <div className="min-h-[3.75rem] text-xs leading-relaxed">
        <StepOutcome step={step} />
      </div>

      <StepLinks step={step} />
    </div>
  );
}

function StepOutcome({ step }: { step: RunStep }) {
  const review = step.review;
  if (step.status === "BLOCKED" && step.gate) {
    return (
      <p className="flex flex-wrap items-center gap-1">
        Denied at the <GateMark gate={step.gate} className="font-medium" /> gate.
      </p>
    );
  }
  if (review?.reviewer) {
    const verb = review.status === "REJECTED" ? "Rejected" : "Approved";
    return (
      <div className="flex flex-col gap-0.5">
        <p>
          {verb} by <span className="font-medium">{review.reviewer}</span>
          {review.reviewedAt ? (
            <>
              {" "}
              <time dateTime={review.reviewedAt} className="text-muted-foreground">
                {formatTimestamp(review.reviewedAt)}
              </time>
            </>
          ) : null}
        </p>
        {review.note ? <p className="line-clamp-2 text-muted-foreground">“{review.note}”</p> : null}
        {step.status === "EXPIRED" ? <p className="text-muted-foreground">Expired before the agent claimed it.</p> : null}
      </div>
    );
  }
  return <p className="text-muted-foreground">{STEP_STATUS_META[step.status].detail}</p>;
}

function StepLinks({ step }: { step: RunStep }) {
  const linkClass =
    "rounded-sm text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";
  if (!step.row) return <p className="mt-auto text-xs text-muted-foreground">No request recorded</p>;
  return (
    <p className="mt-auto flex flex-wrap gap-x-3 gap-y-1 text-xs">
      <Link href={buildActivityHref(parseActivityParams({ request: step.row.requestId }))} className={linkClass}>
        Request in Activity<span className="sr-only"> for step {step.index}</span>
      </Link>
      {step.review ? (
        <Link href={buildWorkspaceHref({ tab: tabFor(step.review), review: step.review.id })} className={linkClass}>
          Open review<span className="sr-only"> for step {step.index}</span>
        </Link>
      ) : null}
    </p>
  );
}

function ScenarioDetails({ scenario }: { scenario: PipelineScenario }) {
  const tools = MOCK_TOOLS.filter((tool) => scenario.steps.some((step) => step.tool === tool.name));
  return (
    <details className="group rounded-lg border bg-card">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 rounded-lg px-3 py-2.5 text-sm font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring/50 [&::-webkit-details-marker]:hidden">
        What this scenario does
        <ChevronDown aria-hidden="true" className="size-4 text-muted-foreground transition-transform duration-150 group-open:rotate-180 motion-reduce:transition-none" />
      </summary>
      <div className="flex flex-col gap-3 border-t px-3 py-3 text-sm">
        <p>
          <span className="font-mono text-xs text-muted-foreground">{scenario.id}</span> · {scenario.description}
        </p>
        <p className="rounded-md bg-muted px-3 py-2 text-foreground/90">
          <span className="font-medium">Documented expectation: </span>
          {scenario.documentedExpectation} This is what the simulator&apos;s rules predict; the cards above are what was recorded.
        </p>
        <ul className="flex flex-col gap-1 text-xs text-muted-foreground">
          {tools.map((tool) => (
            <li key={tool.name}>
              <span className="font-mono text-foreground">{tool.name}</span>: {tool.summary}
            </li>
          ))}
        </ul>
      </div>
    </details>
  );
}

function UnknownPipelineNote({ slug }: { slug: string }) {
  return (
    <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
      The pipeline <span className="font-mono">{slug}</span> is not in this page&apos;s scenario catalog
      (lib/pipeline/catalog.ts), so its recorded requests are listed in order without expected steps.
    </p>
  );
}
