"use client";

import { Fragment } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowLeft, ArrowRight, CornerDownRight } from "lucide-react";
import { DECISION_MARKS } from "@/components/checkpoint/decision-mark";
import { Button } from "@/components/ui/button";
import { applyCarouselKey, stepIndex } from "@/lib/landing/carousel";
import { LANDING_SCENARIOS } from "@/lib/landing/content";
import { breakableParts } from "@/lib/landing/text";
import { cn } from "@/lib/utils";
import { DecisionTag } from "./landing-primitives";

/**
 * One scenario at a time with Previous / Next, and Left/Right/Home/End while the carousel is focused. The
 * title and steps swap with a fade and a short drop; the decision only fades, so a DENY is readable on its
 * first frame. A polite live region names the new scenario and its outcome.
 */
export function ScenarioSwitcher({ index, onChange }: { index: number; onChange: (index: number) => void }) {
  const count = LANDING_SCENARIOS.length;
  const scenario = LANDING_SCENARIOS[index];

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.target !== event.currentTarget) return;
    const next = applyCarouselKey(index, event.key, count);
    if (next === null) return;
    event.preventDefault();
    onChange(next);
  }

  return (
    <div
      role="group"
      aria-roledescription="carousel"
      aria-label="Simulator scenarios. Use the Left and Right arrow keys to switch."
      tabIndex={0}
      onKeyDown={onKeyDown}
      className="flex flex-col gap-4 rounded-xl focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
    >
      <p className="sr-only" aria-live="polite">
        Scenario {index + 1} of {count}: {scenario.title}. Outcome {DECISION_MARKS[scenario.decision].label}, at {scenario.stage}.
      </p>

      <div className="relative overflow-hidden rounded-xl border border-border bg-card/85 backdrop-blur-sm">
        <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-2.5">
          <span className="font-mono text-xs tabular-nums text-muted-foreground">
            {String(index + 1).padStart(2, "0")} / {String(count).padStart(2, "0")}
          </span>
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={`${scenario.id}-decision`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="flex items-center gap-2"
            >
              <DecisionTag decision={scenario.decision} />
              <span className="font-mono text-[0.6875rem] tracking-[0.08em] text-muted-foreground uppercase">at {scenario.stage}</span>
            </motion.span>
          </AnimatePresence>
        </div>

        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={scenario.id}
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            transition={{ duration: 0.22 }}
            className="flex flex-col gap-4 p-5"
          >
            <div className="flex flex-col gap-1">
              <h3 className="font-heading text-xl font-semibold tracking-tight">{scenario.title}</h3>
              <code className="w-fit max-w-full overflow-x-auto rounded-md border border-border bg-muted/50 px-2 py-1 font-mono text-xs">
                {scenario.command}
              </code>
            </div>
            <ol className="flex flex-col gap-1.5 font-mono text-xs">
              {scenario.steps.map((step, stepIndexValue) => {
                const decisive = stepIndexValue === scenario.decisiveStep;
                const after = stepIndexValue > scenario.decisiveStep && scenario.decision !== "ALLOW";
                return (
                  <li
                    key={`${step.action}-${step.resource}-${stepIndexValue}`}
                    className={cn(
                      "rounded-md px-2 py-1",
                      decisive && "border border-border bg-muted/50",
                      after && "text-muted-foreground line-through decoration-muted-foreground/50",
                    )}
                  >
                    {/* Below 640 px: two lines, the resource on its own line and wrapping only at "/" or "-". */}
                    <div className="flex flex-col gap-0.5 sm:hidden">
                      <div className="flex flex-wrap items-center gap-x-2">
                        <span className="w-4 shrink-0 tabular-nums text-muted-foreground">{stepIndexValue + 1}</span>
                        <span className="font-medium">{step.action}</span>
                        <span>{step.tool}</span>
                        {decisive && <DecidedHere />}
                      </div>
                      <span className="pl-6 break-normal [overflow-wrap:anywhere]">
                        {breakableParts(step.resource).map((part, partIndex) => (
                          <Fragment key={partIndex}>
                            {partIndex > 0 && <wbr />}
                            {part}
                          </Fragment>
                        ))}
                      </span>
                    </div>
                    {/* From 640 px: one row, as before. */}
                    <div className="hidden items-start gap-2 sm:flex">
                      <span className="w-4 shrink-0 tabular-nums text-muted-foreground">{stepIndexValue + 1}</span>
                      <span className="w-28 shrink-0 font-medium">{step.action}</span>
                      <span className="w-20 shrink-0">{step.tool}</span>
                      <span className="min-w-0 break-all">{step.resource}</span>
                      {decisive && <DecidedHere className="ml-auto" />}
                    </div>
                    {after && <span className="sr-only"> (not reached)</span>}
                  </li>
                );
              })}
            </ol>
            <p className="text-sm leading-relaxed text-muted-foreground">{scenario.explanation}</p>
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="flex items-center gap-2">
        <Button variant="outline" size="icon" onClick={() => onChange(stepIndex(index, -1, count))} aria-label="Previous scenario">
          <ArrowLeft aria-hidden="true" />
        </Button>
        <Button variant="outline" size="icon" onClick={() => onChange(stepIndex(index, 1, count))} aria-label="Next scenario">
          <ArrowRight aria-hidden="true" />
        </Button>
        <ol className="ml-2 flex items-center gap-1.5" aria-label="Scenario position">
          {LANDING_SCENARIOS.map((item, itemIndex) => (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => onChange(itemIndex)}
                aria-label={`Scenario ${itemIndex + 1}: ${item.title}`}
                aria-current={itemIndex === index ? "step" : undefined}
                className="group flex h-6 items-center px-1 focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-ring"
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    "block h-1.5 rounded-full",
                    itemIndex === index ? "w-6 bg-foreground" : "w-1.5 bg-foreground/25 group-hover:bg-foreground/50",
                  )}
                />
              </button>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

function DecidedHere({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex shrink-0 items-center gap-1 text-muted-foreground", className)}>
      <CornerDownRight aria-hidden="true" className="size-3" />
      decided here
    </span>
  );
}
