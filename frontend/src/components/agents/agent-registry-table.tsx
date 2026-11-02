"use client";

import { AgentStatusBadge } from "@/components/agents/agent-status-badge";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatTimestamp, shortId } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { AgentResponse } from "@/types/api";

interface AgentRegistryTableProps {
  agents: AgentResponse[];
  selectedId?: string;
  onSelect: (id: string) => void;
}

/** Desktop layout. Hidden below md, where AgentRegistryCards takes over from the same data. */
export function AgentRegistryTable({ agents, selectedId, onSelect }: AgentRegistryTableProps) {
  return (
    <div className="hidden md:block">
      <Table>
        <TableCaption className="sr-only">Registered agents</TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead>Agent</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Key prefix</TableHead>
            <TableHead>Created</TableHead>
            <TableHead>Updated</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {agents.map((agent) => {
            const selected = agent.id === selectedId;
            return (
              <TableRow key={agent.id} data-state={selected ? "selected" : undefined}>
                <TableCell className="max-w-xs">
                  <button
                    type="button"
                    onClick={() => onSelect(agent.id)}
                    aria-current={selected ? "true" : undefined}
                    className="flex min-w-0 flex-col items-start gap-0.5 rounded-sm text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <span className="truncate text-sm font-medium hover:underline">{agent.name}</span>
                    <span className="truncate text-xs text-muted-foreground">
                      {agent.description ?? "No description"}
                    </span>
                    <span className="font-mono text-[11px] text-muted-foreground">{shortId(agent.id)}</span>
                  </button>
                </TableCell>
                <TableCell>
                  <AgentStatusBadge status={agent.status} />
                </TableCell>
                <TableCell className={cn("font-mono text-xs", agent.apiKeyPrefix === null && "text-muted-foreground")}>
                  {agent.apiKeyPrefix ?? "No active key"}
                </TableCell>
                <TableCell>
                  <time dateTime={agent.createdAt} className="font-mono text-xs tabular-nums text-muted-foreground">
                    {formatTimestamp(agent.createdAt)}
                  </time>
                </TableCell>
                <TableCell>
                  <time dateTime={agent.updatedAt} className="font-mono text-xs tabular-nums text-muted-foreground">
                    {formatTimestamp(agent.updatedAt)}
                  </time>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
