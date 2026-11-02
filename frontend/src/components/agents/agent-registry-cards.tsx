"use client";

import { AgentStatusBadge } from "@/components/agents/agent-status-badge";
import { formatTimestamp } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { AgentResponse } from "@/types/api";

interface AgentRegistryCardsProps {
  agents: AgentResponse[];
  selectedId?: string;
  onSelect: (id: string) => void;
}

/**
 * Mobile layout. Each agent is a real button, so keyboard and screen-reader users get the same
 * selection as pointer users. Shown below md; the desktop table is hidden there.
 */
export function AgentRegistryCards({ agents, selectedId, onSelect }: AgentRegistryCardsProps) {
  return (
    <ul className="flex flex-col gap-2 md:hidden" aria-label="Registered agents">
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
                "flex w-full flex-col gap-2 rounded-lg border bg-card p-3 text-left transition-colors duration-150 motion-reduce:transition-none hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                selected && "border-foreground/30 bg-muted",
              )}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="min-w-0 truncate text-sm font-medium">{agent.name}</p>
                <AgentStatusBadge status={agent.status} />
              </div>
              <p className="line-clamp-2 text-xs text-muted-foreground">{agent.description ?? "No description"}</p>
              <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <span>
                  {agent.apiKeyPrefix === null ? (
                    "No active key"
                  ) : (
                    <>
                      Key <span className="font-mono text-foreground">{agent.apiKeyPrefix}</span>
                    </>
                  )}
                </span>
                <time dateTime={agent.createdAt} className="font-mono tabular-nums">
                  {formatTimestamp(agent.createdAt)}
                </time>
              </div>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
