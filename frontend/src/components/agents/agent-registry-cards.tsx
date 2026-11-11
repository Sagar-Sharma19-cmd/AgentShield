"use client";

import { AgentStatusBadge } from "@/components/agents/agent-status-badge";
import { formatDate, formatTimestamp } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { AgentResponse } from "@/types/api";

interface AgentRegistryCardsProps {
  agents: AgentResponse[];
  selectedId?: string;
  onSelect: (id: string) => void;
}

/**
 * Mobile layout: compact rows. Each agent is a real button, so keyboard and screen-reader users get the
 * same selection as pointer users. Shown below md; the desktop table is hidden there.
 */
export function AgentRegistryCards({ agents, selectedId, onSelect }: AgentRegistryCardsProps) {
  return (
    <ul className="flex flex-col divide-y divide-border overflow-hidden rounded-lg border border-border bg-card md:hidden" aria-label="Registered agents">
      {agents.map((agent) => {
        const selected = agent.id === selectedId;
        return (
          <li key={agent.id}>
            <button
              type="button"
              data-agent-id={agent.id}
              onClick={() => onSelect(agent.id)}
              aria-current={selected ? "true" : undefined}
              className={cn(
                "flex w-full flex-col gap-1 px-3 py-2.5 text-left transition-colors duration-150 motion-reduce:transition-none hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
                selected && "bg-muted/60 shadow-[inset_2px_0_0_var(--color-foreground)]",
              )}
            >
              <span className="flex items-center justify-between gap-2">
                <span className="min-w-0 truncate font-mono text-sm font-medium">{agent.name}</span>
                <AgentStatusBadge status={agent.status} />
              </span>
              <span className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
                <span className={cn("truncate font-mono", agent.apiKeyPrefix !== null && "text-foreground")}>
                  {agent.apiKeyPrefix ?? "No active key"}
                </span>
                <time dateTime={agent.createdAt} title={formatTimestamp(agent.createdAt)} className="shrink-0 font-mono tabular-nums">
                  {formatDate(agent.createdAt)}
                </time>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
