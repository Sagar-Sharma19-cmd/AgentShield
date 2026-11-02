"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { RotateCw, Search } from "lucide-react";
import { RegisterAgentFlow } from "@/components/agents/register-agent-flow";
import { AgentRegistryCards } from "@/components/agents/agent-registry-cards";
import { AgentRegistryTable } from "@/components/agents/agent-registry-table";
import { AGENTS_PAGE_HEADING_ID, AgentDetailSheet } from "@/components/agents/agent-detail-sheet";
import { AgentRegistryError } from "@/components/agents/agent-registry-error";
import { DashboardCard, SectionEmpty, SectionSkeleton } from "@/components/dashboard/section-states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

/**
 * Agent registry with client-side search and status filtering. The status filter and the selected
 * agent live in the URL, matching the Reviews page. Search is local state so typing does not add
 * browser history entries.
 */
export function AgentsWorkspace({ state }: { state: AgentUrlState }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const registry = useAgentRegistry();
  const [search, setSearch] = useState("");

  const agents = registry.data;
  const counts = agents ? countAgentsByStatus(agents) : undefined;
  const visible = agents
    ? sortAgentsNewestFirst(filterAgents(agents, { search, status: state.status }))
    : [];
  const hasFilters = search.trim() !== "" || state.status !== "ALL";

  /** Uses the live query string so parameters this page does not own are kept. */
  function navigate(next: { status: AgentStatusFilter; agent?: string }) {
    router.replace(buildAgentsHref(next, new URLSearchParams(window.location.search)), { scroll: false });
  }

  /** Opening pushes a history entry, so browser Back closes the detail sheet. */
  function openAgent(id: string) {
    router.push(buildAgentsHref({ status: state.status, agent: id }, new URLSearchParams(window.location.search)), {
      scroll: false,
    });
  }

  /** Closing replaces the entry, so the list is not stacked with a duplicate step. */
  function closeAgent() {
    navigate({ status: state.status });
  }

  function clearFilters() {
    setSearch("");
    navigate({ status: "ALL" });
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-5 p-4 md:p-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1
            id={AGENTS_PAGE_HEADING_ID}
            tabIndex={-1}
            className="text-2xl font-semibold tracking-tight outline-none"
          >
            Agents
          </h1>
          <p className="text-sm text-muted-foreground">
            Registered AI agent identities and their current status.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={registry.isFetching}
            onClick={() => void refreshAgentRegistry(queryClient)}
          >
            <RotateCw aria-hidden="true" className={registry.isFetching ? "animate-spin motion-reduce:animate-none" : undefined} />
            Refresh
          </Button>
          <RegisterAgentFlow />
        </div>
      </header>

      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <Tabs
          value={state.status}
          onValueChange={(value) => navigate({ status: value as AgentStatusFilter })}
        >
          <TabsList aria-label="Filter agents by status" className="flex h-auto w-full flex-wrap justify-start">
            {AGENT_STATUS_FILTERS.map((status) => (
              <TabsTrigger key={status} value={status} className="gap-2">
                {AGENT_STATUS_FILTER_LABELS[status]}
                <span className="font-mono text-xs tabular-nums text-muted-foreground">
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

      {registry.isError && agents && (
        <p role="status" className="text-xs text-muted-foreground">
          The registry could not be refreshed. The list below is the last one loaded.
        </p>
      )}

      <DashboardCard
        title="Registered agents"
        description={
          agents
            ? `Showing ${visible.length} of ${agents.length}.`
            : registry.isError
              ? "The registry could not be loaded."
              : "Loading the registry."
        }
      >
        {registry.isPending ? (
          <SectionSkeleton label="Loading agents" rows={4} />
        ) : !agents ? (
          <AgentRegistryError error={registry.error} onRetry={() => void registry.refetch()} />
        ) : agents.length === 0 ? (
          <SectionEmpty
            title="No agents registered"
            body="Registered agents appear here with their status and key prefix."
          />
        ) : visible.length === 0 ? (
          <div className="flex flex-1 flex-col items-center gap-3">
            <SectionEmpty
              title="No agents match"
              body="Try a different search, or choose another status."
            />
            {hasFilters && (
              <Button variant="outline" size="sm" onClick={clearFilters}>
                Clear search and filters
              </Button>
            )}
          </div>
        ) : (
          <>
            <AgentRegistryTable agents={visible} selectedId={state.agent} onSelect={openAgent} />
            <AgentRegistryCards agents={visible} selectedId={state.agent} onSelect={openAgent} />
          </>
        )}
      </DashboardCard>

      <AgentDetailSheet
        agentId={state.agent}
        onClose={closeAgent}
        onRestoreAgent={(id) => navigate({ status: state.status, agent: id })}
      />
    </div>
  );
}
