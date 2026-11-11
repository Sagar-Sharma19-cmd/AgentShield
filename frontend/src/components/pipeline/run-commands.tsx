"use client";

import { useEffect, useState } from "react";
import { Check, Copy, Terminal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PIPELINE_SCENARIOS, SIMULATOR_SETUP_COMMANDS, simulatorRunCommand, type PipelineScenario } from "@/lib/pipeline/catalog";
import { cn } from "@/lib/utils";

const RESET_MS = 2000;

/**
 * "Copy run command" with a visible label. The result is announced politely and the icon changes, so it is
 * not shown by colour alone. The command holds no secret: keys come from the shell environment.
 */
export function CopyRunCommand({ scenario, className }: { scenario: Pick<PipelineScenario, "id">; className?: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const command = simulatorRunCommand(scenario);

  useEffect(() => {
    if (state === "idle") return;
    const timer = window.setTimeout(() => setState("idle"), RESET_MS);
    return () => window.clearTimeout(timer);
  }, [state]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(command);
      setState("copied");
    } catch {
      setState("failed");
    }
  }

  const Icon = state === "copied" ? Check : Copy;
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <Button type="button" variant="outline" size="sm" onClick={() => void copy()} title={command}>
        <Icon aria-hidden="true" />
        Copy run command
        <span className="sr-only">: {command}</span>
      </Button>
      <span aria-live="polite" className="text-xs text-muted-foreground">
        {state === "copied" ? "Copied" : state === "failed" ? "Copy failed" : ""}
      </span>
    </span>
  );
}

/** The short "How to run" tip: setup once, load the agent's environment, then run a scenario. */
export function HowToRun({ scenario }: { scenario?: Pick<PipelineScenario, "id"> }) {
  const lines = [...SIMULATOR_SETUP_COMMANDS, simulatorRunCommand(scenario ?? PIPELINE_SCENARIOS[2])];
  return (
    <div className="flex flex-col gap-2 text-sm">
      <p className="flex items-center gap-2 font-medium">
        <Terminal aria-hidden="true" className="size-4 text-muted-foreground" />
        How to run
      </p>
      <p className="text-muted-foreground">
        From the repository root, with the admin key in your shell. Setup registers the demo agent and its grants and
        stores its key in <span className="font-mono">~/.agentshield-demo/env</span>; it is never printed or shown here.
      </p>
      <pre className="overflow-x-auto rounded-md border bg-muted/50 p-3 font-mono text-xs leading-relaxed">{lines.join("\n")}</pre>
    </div>
  );
}

/** Every scenario's exact command, for the empty state. */
export function ScenarioCommands() {
  return (
    <ul className="flex flex-col gap-2">
      {PIPELINE_SCENARIOS.map((scenario) => (
        <li key={scenario.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-card px-3 py-2">
          <span className="flex min-w-0 flex-col">
            <span className="text-sm font-medium">{scenario.title}</span>
            <span className="font-mono text-[0.6875rem] break-all text-muted-foreground">{simulatorRunCommand(scenario)}</span>
          </span>
          <CopyRunCommand scenario={scenario} />
        </li>
      ))}
    </ul>
  );
}
