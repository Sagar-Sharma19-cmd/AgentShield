"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { MousePointerClick, RotateCw, Search, X } from "lucide-react";
import { RegisterAgentFlow } from "@/components/agents/register-agent-flow";
import { AgentRegistryCards } from "@/components/agents/agent-registry-cards";
import { AgentRegistryTable } from "@/components/agents/agent-registry-table";
import { AgentDetailBody, useAgentDetailController } from "@/components/agents/agent-detail";
import { AGENTS_PAGE_HEADING_ID, AgentDetailSheet, findVisibleRegistryTrigger } from "@/components/agents/agent-detail-sheet";
import { AgentRegistryError } from "@/components/agents/agent-registry-error";
import { useIsDesktop } from "@/components/reviews/use-review-clock";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AGENT_STATUS_FILTER_LABELS,
  AGENT_STATUS_FILTERS,
  type AgentStatusFilter,
  type AgentUrlState,
  buildAgentsHref,
  countAgentsByStatus,
  filterAgents,
  sortAgentsNewestFirst,
} from "@/lib/agents/model";
import { useAgentRegistry, refreshAgentRegistry } from "@/lib/queries/agents";

const EYEBROW = "font-mono text-[0.6875rem] tracking-[0.08em] text-muted-foreground uppercase";

/**
 * Agent registry ("Checkpoint" language) with client-side search and status filtering. The status filter and
 * the selected agent live in the URL. Search is local state so typing does not add history entries.
 *
 * From `lg` up the selected agent opens in a sticky pane beside the registry; below `lg` it opens in the
 * sheet. Both render the same AgentDetailBody from one controller owned here. While a key rotation is pending
 * or its key is unacknowledged, the layout is frozen, so a resize cannot swap containers and drop the key.
 */
export function AgentsWorkspace({ state }: { state: AgentUrlState }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const registry = useAgentRegistry();
  const [search, setSearch] = useState("");

  /** Uses the live query string so parameters this page does not own are kept. */
  function navigate(next: { status: AgentStatusFilter; agent?: string }) {
    router.replace(buildAgentsHref(next, new URLSearchParams(window.location.search)), { scroll: false });
  }

  /** Opening pushes a history entry, so browser Back closes the detail. */
  function openAgent(id: string) {
    router.push(buildAgentsHref({ status: state.status, agent: id }, new URLSearchParams(window.location.search)), {
      scroll: false,
    });
  }

  /** Closing replaces the entry, so the list is not stacked with a duplicate step. */
  function closeAgent() {
    navigate({ status: state.status });
  }

  const controller = useAgentDetailController({
    urlAgentId: state.agent,
    onClose: closeAgent,
    onRestoreAgent: (id) => navigate({ status: state.status, agent: id }),
  });

  const liveDesktop = useIsDesktop();
  // Adjust-during-render: remember the layout when a hold starts, release it when the hold ends.
  const [heldDesktop, setHeldDesktop] = useState<boolean | null>(null);
  if (controller.hold !== null && heldDesktop === null) setHeldDesktop(liveDesktop);
  if (controller.hold === null && heldDesktop !== null) setHeldDesktop(null);
  const isDesktop = heldDesktop ?? liveDesktop;

  const agents = registry.data;
  const counts = agents ? countAgentsByStatus(agents) : undefined;
  const visible = agents ? sortAgentsNewestFirst(filterAgents(agents, { search, status: state.status })) : [];
  const hasFilters = search.trim() !== "" || state.status !== "ALL";

  function clearFilters() {
    setSearch("");
    navigate({ status: "ALL" });
  }

  function closePane() {
    const id = controller.agentId;
    controller.requestClose();
    // Focus returns to the row that opened the pane, once it is no longer selected.
    if (id && !controller.hold) {
      requestAnimationFrame(() => (findVisibleRegistryTrigger(id) ?? document.getElementById(AGENTS_PAGE_HEADING_ID))?.focus());
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 p-4 md:p-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <p className={EYEBROW}>Configure · Identity gate</p>
          <h1 id={AGENTS_PAGE_HEADING_ID} tabIndex={-1} className="text-2xl font-semibold tracking-tight outline-none">
            Agents
          </h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Registered agent identities. The gateway checks each request&apos;s agent and key first, then its grants at the
            Permission gate.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" disabled={registry.isFetching} onClick={() => void refreshAgentRegistry(queryClient)}>
            <RotateCw aria-hidden="true" className={registry.isFetching ? "animate-spin motion-reduce:animate-none" : undefined} />
            Refresh
          </Button>
          <RegisterAgentFlow />
        </div>
      </header>

      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <Tabs value={state.status} onValueChange={(value) => navigate({ status: value as AgentStatusFilter })}>
          <TabsList aria-label="Filter agents by status" className="flex h-auto w-full flex-wrap justify-start">
            {AGENT_STATUS_FILTERS.map((status) => (
              <TabsTrigger key={status} value={status} className="gap-2">
                {AGENT_STATUS_FILTER_LABELS[status]}
                <span className="font-mono text-xs tabular-nums text-muted-foreground">
                  <span className="sr-only">, </span>
                  {counts ? counts[status] : "–"}
                </span>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <div className="relative w-full md:w-72">
          <Search aria-hidden="true" className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            aria-label="Search agents by name or description"
            placeholder="Search name or description"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="pl-8"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        <section aria-labelledby="agent-registry-heading" className="flex min-w-0 flex-col gap-2">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="agent-registry-heading" className={EYEBROW}>
              Registered agents
            </h2>
            {agents && (
              <p className="font-mono text-xs tabular-nums text-muted-foreground">
                {visible.length} of {agents.length} shown
              </p>
            )}
          </div>

          {registry.isError && agents && (
            <p role="status" className="text-xs text-muted-foreground">
              The registry could not be refreshed. The list below is the last one loaded.
            </p>
          )}

          {registry.isPending ? (
            <RegistrySkeleton />
          ) : !agents ? (
            <AgentRegistryError error={registry.error} onRetry={() => void registry.refetch()} />
          ) : agents.length === 0 ? (
            <div className="flex flex-col items-start gap-2 rounded-lg border border-dashed border-border px-4 py-6">
              <p className="text-sm font-medium">No agents registered</p>
              <p className="max-w-md text-sm text-muted-foreground">
                The gateway denies every request whose agent is not registered (AGENT_NOT_FOUND). Register an agent to get
                its API key, then grant it the tools it needs.
              </p>
              <RegisterAgentFlow />
            </div>
          ) : visible.length === 0 ? (
            <div className="flex flex-col items-start gap-3 rounded-lg border border-dashed border-border px-4 py-6">
              <p className="text-sm font-medium">No agents match</p>
              <p className="text-sm text-muted-foreground">Try a different search, or choose another status.</p>
              {hasFilters && (
                <Button variant="outline" size="sm" onClick={clearFilters}>
                  Clear search and filters
                </Button>
              )}
            </div>
          ) : (
            <>
              <AgentRegistryTable agents={visible} selectedId={controller.agentId} onSelect={openAgent} />
              <AgentRegistryCards agents={visible} selectedId={controller.agentId} onSelect={openAgent} />
            </>
          )}
        </section>

        {isDesktop ? (
          // Sticky below the 56 px app header. Nothing here is transformed, so stickiness is not broken.
          <section
            aria-label={controller.detail.data ? `Agent ${controller.detail.data.name}` : "Selected agent"}
            className="sticky top-[4.5rem] max-h-[calc(100dvh-5.5rem)] min-w-0 overflow-y-auto rounded-lg border border-border bg-card p-5"
          >
            {controller.agentId ? (
              <div className="flex flex-col gap-2">
                {!controller.dismissBlocked && (
                  <div className="flex justify-end">
                    <Button variant="ghost" size="sm" onClick={closePane}>
                      <X aria-hidden="true" />
                      Close
                    </Button>
                  </div>
                )}
                <AgentDetailBody controller={controller} showTitle />
              </div>
            ) : (
              <NothingSelected hasAgents={visible.length > 0} />
            )}
          </section>
        ) : null}
      </div>

      {!isDesktop ? <AgentDetailSheet controller={controller} /> : null}
    </div>
  );
}

function NothingSelected({ hasAgents }: { hasAgents: boolean }) {
  return (
    <div className="flex flex-col items-start gap-3 py-6">
      <span className="flex size-9 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <MousePointerClick aria-hidden="true" className="size-4" />
      </span>
      <p className="text-sm font-medium">{hasAgents ? "Select an agent" : "Nothing to show"}</p>
      <p className="max-w-sm text-sm text-muted-foreground">
        {hasAgents
          ? "Its identity, lifecycle actions, permission matrix and recent activity appear here."
          : "When the registry has agents, the selected one appears here."}
      </p>
    </div>
  );
}

/** Rows shaped like the registry's: name and description, status, key prefix, created. */
function RegistrySkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading agents" className="flex flex-col divide-y divide-border overflow-hidden rounded-lg border border-border">
      {Array.from({ length: 5 }, (_, index) => (
        <div key={index} className="flex items-center gap-3 px-3 py-2.5">
          <div className="flex flex-1 flex-col gap-1.5">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-2/3" />
          </div>
          <Skeleton className="h-6 w-20" />
          <Skeleton className="hidden h-4 w-24 md:block" />
        </div>
      ))}
    </div>
  );
}
