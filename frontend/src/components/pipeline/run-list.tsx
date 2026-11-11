"use client";

import { formatTimestamp } from "@/lib/format";
import { runTitle, splitByKind, type PipelineRun, type RunStatus, type RunStep } from "@/lib/pipeline/runs";
import { cn } from "@/lib/utils";
import { RunStatusMark, StepDots } from "./status-marks";

export interface RunListEntry {
  run: PipelineRun;
  steps: RunStep[];
  status: RunStatus;
}

const DONE = new Set(["EXECUTED", "APPROVED_EXECUTED"]);

/**
 * Runs of the selected agent, newest first, in two groups: real pipeline runs (agentshield-guard, for example
 * Jenkins) and simulator runs. A group heading is shown only when the agent has both kinds.
 */
export function RunList({
  entries,
  selectedId,
  onSelect,
}: {
  entries: readonly RunListEntry[];
  selectedId: string | undefined;
  onSelect: (sessionId: string) => void;
}) {
  const { real, simulator } = splitByKind(entries);
  const groups = [
    { key: "real", title: "Real pipeline runs", entries: real },
    { key: "simulator", title: "Simulator runs", entries: simulator },
  ].filter((group) => group.entries.length > 0);
  if (groups.length === 1) {
    return <RunGroup label={groups[0].title} entries={groups[0].entries} selectedId={selectedId} onSelect={onSelect} />;
  }
  return (
    <div className="flex flex-col gap-4">
      {groups.map((group) => (
        <section key={group.key} aria-labelledby={`runs-${group.key}`} className="flex flex-col gap-2">
          <h3 id={`runs-${group.key}`} className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            {group.title} <span className="font-normal">({group.entries.length})</span>
          </h3>
          <RunGroup label={group.title} entries={group.entries} selectedId={selectedId} onSelect={onSelect} />
        </section>
      ))}
    </div>
  );
}

/**
 * One group of runs. Each run is a button; the selected one has aria-pressed, a left bar and a filled
 * background, so selection is not shown by colour alone.
 */
function RunGroup({
  label,
  entries,
  selectedId,
  onSelect,
}: {
  label: string;
  entries: readonly RunListEntry[];
  selectedId: string | undefined;
  onSelect: (sessionId: string) => void;
}) {
  return (
    <ul aria-label={label} className="flex flex-col gap-1.5">
      {entries.map(({ run, steps, status }) => {
        const selected = run.sessionId === selectedId;
        const done = steps.filter((step) => DONE.has(step.status)).length;
        return (
          <li key={run.sessionId}>
            <button
              type="button"
              aria-pressed={selected}
              onClick={() => onSelect(run.sessionId)}
              className={cn(
                "relative flex w-full flex-col gap-1.5 rounded-lg border px-3 py-2.5 text-left outline-none transition-colors duration-150 focus-visible:ring-3 focus-visible:ring-ring/50 motion-reduce:transition-none",
                selected ? "border-primary/50 bg-muted" : "border-border bg-card hover:bg-muted/60",
              )}
            >
              {selected ? <span aria-hidden="true" className="absolute inset-y-2 left-0 w-[3px] rounded-full bg-primary" /> : null}
              <span className="flex items-start justify-between gap-2">
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{runTitle(run)}</span>
                  <span className="block truncate font-mono text-[0.6875rem] text-muted-foreground">{run.sessionId}</span>
                </span>
                <RunStatusMark status={status} kind={run.kind} className="shrink-0" />
              </span>
              <span className="flex items-center justify-between gap-2">
                <time dateTime={run.startedAt} className="font-mono text-[0.6875rem] text-muted-foreground tabular-nums">
                  {formatTimestamp(run.startedAt)}
                </time>
                <StepDots statuses={steps.map((step) => step.status)} />
                <span className="sr-only">
                  {run.kind === "real" ? `${done} of ${steps.length} steps authorized.` : `${done} of ${steps.length} steps ran.`}
                </span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
