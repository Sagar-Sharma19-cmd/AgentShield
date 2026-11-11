"use client";

import { useEffect, useId, useState } from "react";
import { PageContainer, PageHeader } from "@/components/shell/page-header";
import { useQueryClient } from "@tanstack/react-query";
import { TriangleAlert } from "lucide-react";
import { DashboardCard, SectionError, SectionSkeleton } from "@/components/dashboard/section-states";
import { useNow } from "@/components/reviews/use-review-clock";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAgentRegistry } from "@/lib/queries/agents";
import { AGENT_SAMPLE_SIZE, useAgentAuditSample } from "@/lib/queries/audit";
import { reviewKeys, useReviewLists } from "@/lib/queries/reviews";
import { agentFriendlyLabel, JENKINS_CI_AGENT, PIPELINE_SCENARIOS } from "@/lib/pipeline/catalog";
import {
  groupRuns,
  IDLE_REFRESH_MS,
  LIVE_REFRESH_MS,
  pollIntervalFor,
  reviewsByRequest,
  runStatus,
  runSteps,
  type RunReview,
} from "@/lib/pipeline/runs";
import { REVIEW_STATUSES } from "@/lib/reviews/model";
import type { AgentResponse } from "@/types/api";
import { CopyRunCommand, HowToRun, JenkinsHowTo, ScenarioCommands } from "./run-commands";
import { RunList, type RunListEntry } from "./run-list";
import { RunPipeline } from "./run-pipeline";

/**
 * CI/CD demo as live pipeline runs. A run is the set of the selected agent's audit rows that share one session id:
 * a simulator run (mock tools) or a real run from agentshield-guard (for example one Jenkins build). Each step's
 * status comes from its row and its review request (lib/pipeline/runs.ts). This page only reads: approving or
 * rejecting happens in Reviews, which each waiting step links to.
 */
export function PipelineWorkspace() {
  const registry = useAgentRegistry();
  const [agentId, setAgentId] = useState<string>("");
  const [pinnedRun, setPinnedRun] = useState<string | null>(null);
  const selectId = useId();
  const agents = registry.data ?? [];
  const agent = agents.find((item) => item.id === agentId);

  const picker = (
    <div className="flex w-full max-w-xs flex-col gap-2">
      <Label htmlFor={selectId}>Agent</Label>
      {registry.isPending ? (
        <SectionSkeleton label="Loading agents" rows={1} />
      ) : registry.isError ? (
        <SectionError error={registry.error} onRetry={() => void registry.refetch()} subject="agents" />
      ) : (
        <Select
          value={agentId}
          onValueChange={(value) => {
            setAgentId(value ?? "");
            setPinnedRun(null);
          }}
        >
          <SelectTrigger id={selectId} className="w-full">
            <SelectValue placeholder={agents.length === 0 ? "No agents registered" : "Choose an agent"} />
          </SelectTrigger>
          <SelectContent>
            {agents.map((item: AgentResponse) => (
              <SelectItem key={item.id} value={item.id}>
                <AgentOption name={item.name} />
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  );

  return (
    <PageContainer wide>
      <PageHeader
        eyebrow="Demo · Jenkins and simulator"
        title="CI/CD pipeline runs"
        description="Follow a pipeline run as it happens: each step's decision, which ones wait for review, and where it stopped."
      />

      <div role="note" className="flex items-start gap-3 rounded-lg border border-warning/40 bg-warning/10 p-4 text-sm">
        <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-warning-text" />
        <div className="flex flex-col gap-1">
          <p className="font-medium text-warning-text">Two kinds of run</p>
          <p className="text-foreground/85">
            <span className="font-medium">Real pipeline runs</span> come from <span className="font-mono">agentshield-guard</span>{" "}
            in Jenkins and run real commands, but only commands wrapped by the guard: anything run without it is not
            stopped. <span className="font-medium">Simulator runs</span> use mock tools that contact nothing. Neither is
            network interception.
          </p>
        </div>
      </div>

      {agent ? (
        <AgentRuns key={agent.id} agentName={agent.name} picker={picker} pinnedRun={pinnedRun} onSelectRun={setPinnedRun} />
      ) : (
        <>
          <div className="flex flex-wrap items-end justify-between gap-4">{picker}</div>
          <DashboardCard title="Choose an agent" description="Its real and simulator runs appear here, newest first.">
            <div className="flex flex-col gap-5">
              <JenkinsHowTo />
              <HowToRun />
            </div>
          </DashboardCard>
        </>
      )}
    </PageContainer>
  );
}

function AgentRuns({
  agentName,
  picker,
  pinnedRun,
  onSelectRun,
}: {
  agentName: string;
  picker: React.ReactNode;
  pinnedRun: string | null;
  onSelectRun: (sessionId: string) => void;
}) {
  const now = useNow();
  const queryClient = useQueryClient();
  const [interval, setPollInterval] = useState(IDLE_REFRESH_MS);
  // The audit agentId column holds the agent's name as sent to the gateway, not its UUID.
  const audit = useAgentAuditSample(agentName, { refetchInterval: interval });
  const reviewLists = useReviewLists();

  const reviews: RunReview[] = REVIEW_STATUSES.flatMap((status) => reviewLists[status].data ?? []);
  const reviewsPending = REVIEW_STATUSES.some((status) => reviewLists[status].isPending);
  const reviewError = REVIEW_STATUSES.map((status) => reviewLists[status]).find((query) => query.isError);
  const reviewMap = reviewsByRequest(reviews);

  const runs = groupRuns(audit.data?.content ?? [], PIPELINE_SCENARIOS, { sampleLimit: AGENT_SAMPLE_SIZE });
  const entries: RunListEntry[] = runs.map((run) => {
    const steps = runSteps(run, run.scenario, reviewMap, now);
    return { run, steps, status: runStatus(steps) };
  });
  // Follow the newest run until the operator picks one.
  const selected = entries.find((entry) => entry.run.sessionId === pinnedRun) ?? entries[0];

  // Poll quickly only while the selected run can still change (adjusted during render, not in an effect).
  const nextInterval = pollIntervalFor(selected?.status, selected?.run.lastActivityAt, now, selected?.run.kind);
  if (nextInterval !== interval) setPollInterval(nextInterval);
  const live = interval === LIVE_REFRESH_MS;

  // Review lists poll every 30 s on their own. While live, refresh them on the fast interval too (visible tab only).
  useEffect(() => {
    if (!live) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void queryClient.invalidateQueries({ queryKey: reviewKeys.lists() });
    }, LIVE_REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [live, queryClient]);

  const toolbar = (
    <div className="flex flex-wrap items-end justify-between gap-4">
      {picker}
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-xs text-muted-foreground" aria-live="off">
          {live ? "Live: refreshing every 4 s" : "Refreshing every 30 s"}
        </span>
        {selected?.run.scenario ? <CopyRunCommand scenario={selected.run.scenario} /> : null}
      </div>
    </div>
  );

  if (audit.isPending || (reviewsPending && !reviewError)) {
    return (
      <>
        {toolbar}
        <SectionSkeleton label="Loading pipeline runs" rows={4} />
      </>
    );
  }
  if (audit.isError) {
    return (
      <>
        {toolbar}
        <SectionError error={audit.error} onRetry={() => void audit.refetch()} subject="pipeline runs" />
      </>
    );
  }

  if (!selected) {
    return (
      <>
        {toolbar}
        <DashboardCard
          title="No runs yet for this agent"
          description={`None of ${agentName}'s latest ${AGENT_SAMPLE_SIZE} requests came from a pipeline run. Start one as shown below.`}
        >
          {agentName === JENKINS_CI_AGENT ? (
            <JenkinsHowTo />
          ) : (
            <div className="flex flex-col gap-5">
              <HowToRun />
              <ScenarioCommands />
            </div>
          )}
        </DashboardCard>
      </>
    );
  }

  return (
    <>
      {toolbar}
      {reviewError ? (
        <SectionError error={reviewError.error!} onRetry={() => void reviewError.refetch()} subject="review requests" />
      ) : null}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(16rem,20rem)_minmax(0,1fr)]">
        <div className="flex flex-col gap-4">
          <h2 className="text-sm font-medium">
            Runs <span className="font-normal text-muted-foreground">({entries.length})</span>
          </h2>
          <div className="max-h-[32rem] overflow-y-auto pr-1 lg:max-h-[calc(100svh-18rem)]">
            <RunList entries={entries} selectedId={selected.run.sessionId} onSelect={onSelectRun} />
          </div>
          <div className="rounded-lg border bg-card p-3">
            {selected.run.kind === "real" ? <JenkinsHowTo /> : <HowToRun scenario={selected.run.scenario ?? undefined} />}
          </div>
        </div>
        <div className="min-w-0 rounded-xl border bg-card/40 p-4 md:p-5">
          <RunPipeline run={selected.run} steps={selected.steps} status={selected.status} />
        </div>
      </div>
    </>
  );
}

/** The agent name, with its friendly label first when it has one ("Jenkins · jenkins-ci-agent"). */
function AgentOption({ name }: { name: string }) {
  const label = agentFriendlyLabel(name);
  return (
    <span className="flex items-center gap-1.5">
      {label ? <span className="text-sm font-medium">{label}</span> : null}
      {label ? <span aria-hidden="true" className="text-muted-foreground">·</span> : null}
      <span className="font-mono text-xs">{name}</span>
    </span>
  );
}
