"use client";

import { AgentStatusBadge } from "@/components/agents/agent-status-badge";
import { formatDate, formatTimestamp } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { AgentResponse } from "@/types/api";

interface AgentRegistryTableProps {
  agents: AgentResponse[];
  selectedId?: string;
  onSelect: (id: string) => void;
}

const HEAD = "px-3 py-2 text-left font-mono text-[0.6875rem] font-normal tracking-[0.08em] text-muted-foreground uppercase";

/**
 * Desktop layout: a dense table. Hidden below md, where AgentRegistryCards takes over from the same data.
 * The agent name is a real button (the row's one tab stop); the selected row has a left rule and
 * aria-current, so selection is never shown by colour alone.
 *
 * There is no "tools granted" column: grants are listed per agent only (GET /permissions/agent/{id}), so a
 * count for every row would need one request per agent. The count is in each agent's detail instead.
 */
export function AgentRegistryTable({ agents, selectedId, onSelect }: AgentRegistryTableProps) {
  return (
    <div className="hidden overflow-hidden rounded-lg border border-border bg-card md:block">
      <table className="w-full table-fixed text-sm">
        <caption className="sr-only">Registered agents</caption>
        <thead>
          <tr className="border-b border-border bg-muted/40">
            <th scope="col" className={HEAD}>
              Agent
            </th>
            <th scope="col" className={cn(HEAD, "w-32")}>
              Status
            </th>
            <th scope="col" className={cn(HEAD, "w-36")}>
              Key prefix
            </th>
            <th scope="col" className={cn(HEAD, "w-28")}>
              Created
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {agents.map((agent) => {
            const selected = agent.id === selectedId;
            return (
              <tr
                key={agent.id}
                data-state={selected ? "selected" : undefined}
                className={cn(
                  "transition-colors duration-150 motion-reduce:transition-none hover:bg-muted/40",
                  selected && "bg-muted/60 shadow-[inset_2px_0_0_var(--color-foreground)]",
                )}
              >
                <td className="px-3 py-2">
                  <button
                    type="button"
                    data-agent-id={agent.id}
                    onClick={() => onSelect(agent.id)}
                    aria-current={selected ? "true" : undefined}
                    className="flex w-full min-w-0 flex-col items-start gap-0.5 rounded-sm text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <span className="w-full truncate font-mono text-sm font-medium hover:underline">{agent.name}</span>
                    <span className="w-full truncate text-xs text-muted-foreground">{agent.description ?? "No description"}</span>
                  </button>
                </td>
                <td className="px-3 py-2">
                  <AgentStatusBadge status={agent.status} />
                </td>
                <td className={cn("truncate px-3 py-2 font-mono text-xs", agent.apiKeyPrefix === null && "text-muted-foreground")}>
                  {agent.apiKeyPrefix ?? "No active key"}
                </td>
                <td className="px-3 py-2">
                  <time
                    dateTime={agent.createdAt}
                    title={formatTimestamp(agent.createdAt)}
                    className="font-mono text-xs tabular-nums text-muted-foreground"
                  >
                    {formatDate(agent.createdAt)}
                  </time>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
