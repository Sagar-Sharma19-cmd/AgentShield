"use client";

import { useId, useState } from "react";
import { FlaskConical, TriangleAlert } from "lucide-react";
import { DashboardCard, SectionEmpty, SectionError, SectionSkeleton } from "@/components/dashboard/section-states";
import { DecisionBadge } from "@/components/security/decision-badge";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAgentRegistry } from "@/lib/queries/agents";
import { useAuditList } from "@/lib/queries/audit";
import {
  DECISION_ORDER,
  MOCK_TOOLS,
  PIPELINE_SCENARIOS,
  SIMULATOR_ENV_NAMES,
  SIMULATOR_RUN_COMMANDS,
  type PipelineScenario,
} from "@/lib/pipeline/catalog";
import { countRecordedDecisions, simulatorRowsOnly } from "@/lib/pipeline/results";
import { ACTION_LABELS, AUTHORIZATION_LABELS, DECISION_LABELS } from "@/lib/labels";
import { formatTimestamp } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { AgentResponse } from "@/types/api";

const MOCK_TOOL_NAMES = MOCK_TOOLS.map((tool) => tool.name);
const RESULTS_LIMIT = 50;

/**
 * CI/CD demonstration. The pipeline and the mock tools are described from the simulator's source. The
 * only outcomes shown are gateway decisions recorded in the audit log for a selected agent.
 */
export function PipelineWorkspace() {
  const [scenarioId, setScenarioId] = useState(PIPELINE_SCENARIOS[0].id);
  const scenario = PIPELINE_SCENARIOS.find((item) => item.id === scenarioId) ?? PIPELINE_SCENARIOS[0];

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-4 md:p-8">
      <header className="flex flex-col gap-2">
        <div className="flex items-center gap-2 text-muted-foreground">
          <FlaskConical aria-hidden="true" className="size-4" />
          <span className="text-xs font-medium tracking-wide uppercase">Mock simulation</span>
        </div>
        <h1 className="font-heading text-2xl font-semibold tracking-tight">CI/CD demo</h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          The simulator runs a scripted pipeline through the AgentShield gateway. Each step is sent for a decision
          first. Tools run only when the gateway allows the step, and every tool is a mock.
        </p>
      </header>

      <div
        role="note"
        className="flex items-start gap-3 rounded-lg border border-warning/40 bg-warning/10 p-4 text-sm"
      >
        <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-warning-text" />
        <div className="flex flex-col gap-1">
          <p className="font-medium text-warning-text">Mock execution only</p>
          <p className="text-foreground/85">
            The simulator is a cooperative client. It does not sit between your systems and the tools, so this demo does
            not show production network interception. Nothing here contacts Jenkins, Docker, Kubernetes, GitHub or any
            registry.
          </p>
        </div>
      </div>

      <DashboardCard
        title="Pipeline"
        description="Choose a scenario. The steps are what the simulator sends, not results."
      >
        <div className="flex flex-col gap-5">
          <div role="group" aria-label="Scenario" className="flex flex-wrap gap-2">
            {PIPELINE_SCENARIOS.map((item) => {
              const selected = item.id === scenario.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => setScenarioId(item.id)}
                  className={cn(
                    "rounded-lg border px-3 py-1.5 text-sm transition-colors duration-150 outline-none focus-visible:ring-3 focus-visible:ring-ring/50 motion-reduce:transition-none",
                    selected
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-card hover:bg-muted",
                  )}
                >
                  {item.title}
                </button>
              );
            })}
          </div>
          <ScenarioSteps scenario={scenario} />
        </div>
      </DashboardCard>

      <DashboardCard title="Mock tools" description="Each mock logs one line to a temporary file and contacts nothing.">
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {MOCK_TOOLS.map((tool) => (
            <li key={tool.name} className="flex flex-col gap-2 rounded-lg border bg-card p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-sm">{tool.name}</span>
                <div className="flex flex-wrap justify-end gap-1">
                  {tool.requiredActions.map((action) => (
                    <Badge key={action} variant="secondary" className="font-normal">
                      {ACTION_LABELS[action]}
                    </Badge>
                  ))}
                </div>
              </div>
              <p className="text-sm text-muted-foreground">{tool.summary}</p>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-muted-foreground">
          The badges show the actions the demo agent needs granted for each tool. Set those grants on the agent from its
          detail panel before running.
        </p>
      </DashboardCard>

      <RecordedResults />

      <DashboardCard title="Run the simulator" description="Run from a terminal in this repository. Keys stay in your shell.">
        <div className="flex flex-col gap-3">
          <pre className="overflow-x-auto rounded-md border bg-muted/50 p-3 font-mono text-xs leading-relaxed">
            {SIMULATOR_RUN_COMMANDS.join("\n")}
          </pre>
          <p className="text-sm text-muted-foreground">
            Set these variables first. Their values are never printed by the simulator or shown here:
          </p>
          <ul className="flex flex-col gap-1 font-mono text-xs">
            {SIMULATOR_ENV_NAMES.map((name) => (
              <li key={name}>{name}</li>
            ))}
          </ul>
        </div>
      </DashboardCard>
    </div>
  );
}

function ScenarioSteps({ scenario }: { scenario: PipelineScenario }) {
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">{scenario.description}</p>
      <ol className="flex flex-col gap-3" aria-label={`${scenario.title} steps`}>
        {scenario.steps.map((step, index) => (
          <li key={`${step.tool}-${index}`} className="flex gap-3 rounded-lg border bg-card p-3">
            <span
              aria-hidden="true"
              className="flex size-7 shrink-0 items-center justify-center rounded-full bg-brand-lilac-soft font-mono text-xs font-medium"
            >
              {index + 1}
            </span>
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-sm">
                  {step.tool}.{step.action.toLowerCase()}
                </span>
                <Badge variant="outline" className="font-normal">
                  {ACTION_LABELS[step.action]}
                </Badge>
              </div>
              <p className="text-sm">{step.summary}</p>
              <p className="truncate font-mono text-xs text-muted-foreground">{step.resource}</p>
            </div>
          </li>
        ))}
      </ol>
      <p className="rounded-md bg-brand-sky-soft px-3 py-2 text-sm text-foreground/90">
        <span className="font-medium">Documented expectation: </span>
        {scenario.documentedExpectation} This is what the simulator&apos;s rules predict, not a recorded result.
      </p>
    </div>
  );
}

function RecordedResults() {
  const registry = useAgentRegistry();
  const [agentId, setAgentId] = useState<string>("");
  const selectId = useId();
  const agents = registry.data ?? [];
  const selected = agents.find((agent) => agent.id === agentId);

  return (
    <DashboardCard
      title="Recorded gateway decisions"
      description="Requests the gateway recorded for the selected agent, newest first. Only the simulator's mock tools are listed."
    >
      <div className="flex flex-col gap-4">
        <div className="flex max-w-sm flex-col gap-2">
          <Label htmlFor={selectId}>Agent</Label>
          {registry.isPending ? (
            <SectionSkeleton label="Loading agents" rows={1} />
          ) : registry.isError ? (
            <SectionError error={registry.error} onRetry={() => void registry.refetch()} subject="agents" />
          ) : (
            <Select value={agentId} onValueChange={(value) => setAgentId(value ?? "")}>
              <SelectTrigger id={selectId} className="w-full">
                <SelectValue placeholder={agents.length === 0 ? "No agents registered" : "Choose an agent"} />
              </SelectTrigger>
              <SelectContent>
                {agents.map((agent: AgentResponse) => (
                  <SelectItem key={agent.id} value={agent.id}>
                    <span className="font-mono text-xs">{agent.name}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        {selected ? (
          <AgentRecordedRows agentName={selected.name} />
        ) : (
          <SectionEmpty title="Choose an agent" body="Its recorded decisions for the mock tools appear here." />
        )}
      </div>
    </DashboardCard>
  );
}

function AgentRecordedRows({ agentName }: { agentName: string }) {
  // The audit agentId column holds the agent's name as sent to the gateway, not its UUID.
  const audit = useAuditList({ agentId: agentName, size: RESULTS_LIMIT });

  if (audit.isPending) return <SectionSkeleton label="Loading recorded decisions" rows={4} />;
  if (audit.isError) return <SectionError error={audit.error} onRetry={() => void audit.refetch()} subject="recorded decisions" />;

  const rows = simulatorRowsOnly(audit.data.content, MOCK_TOOL_NAMES);
  if (rows.length === 0) {
    return (
      <SectionEmpty
        title="No simulator requests recorded"
        body={`${agentName} has no recorded requests to the mock tools yet. Run the simulator with this agent to create them.`}
      />
    );
  }

  const counts = countRecordedDecisions(rows);

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground" aria-live="polite">
        {DECISION_ORDER.map((decision) => `${counts[decision]} ${DECISION_LABELS[decision].toLowerCase()}`).join(", ")}
        {" "}across the {rows.length} most recent matching requests.
      </p>
      <div className="-mx-4 overflow-x-auto px-4 md:-mx-6 md:px-6">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Time</TableHead>
              <TableHead>Request</TableHead>
              <TableHead>Decision</TableHead>
              <TableHead className="hidden md:table-cell">Authorization</TableHead>
              <TableHead className="hidden lg:table-cell">Escalated by</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.requestId}>
                <TableCell>
                  <time dateTime={row.timestamp} className="font-mono text-xs tabular-nums">
                    {formatTimestamp(row.timestamp)}
                  </time>
                </TableCell>
                <TableCell>
                  <div className="flex flex-col">
                    <span className="font-mono text-xs">
                      {row.tool}.{row.action.toLowerCase()}
                    </span>
                    <span className="max-w-[16rem] truncate font-mono text-[0.7rem] text-muted-foreground">{row.resource}</span>
                  </div>
                </TableCell>
                <TableCell>
                  <DecisionBadge decision={row.decision} />
                </TableCell>
                <TableCell className="hidden md:table-cell text-sm">{AUTHORIZATION_LABELS[row.authorizationResult]}</TableCell>
                <TableCell className="hidden font-mono text-xs lg:table-cell">{row.escalatedBy ?? "Not recorded"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
