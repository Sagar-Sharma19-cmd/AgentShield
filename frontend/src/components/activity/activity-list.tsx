"use client";

import { DecisionBadge } from "@/components/security/decision-badge";
import { RiskScore } from "@/components/security/risk-score";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ACTION_LABELS, AUTHORIZATION_LABELS, OUTCOME_LABELS } from "@/lib/labels";
import { formatTimestamp } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { AuditLogResponse } from "@/types/api";

interface ActivityListProps {
  events: AuditLogResponse[];
  selectedRequestId?: string;
  onSelect: (requestId: string) => void;
  /** Dims the list while a newer page is loading. */
  isUpdating: boolean;
}

/**
 * Desktop: a sortable-by-design table with decision and risk next to the timestamp.
 * Below md: stacked cards with the same fields, so no column is cut off or shrunk to unreadable.
 */
export function ActivityList({ events, selectedRequestId, onSelect, isUpdating }: ActivityListProps) {
  return (
    <div className={cn("transition-opacity duration-150 motion-reduce:transition-none", isUpdating && "opacity-60")}>
      <div className="hidden overflow-hidden rounded-lg border bg-card md:block">
        <Table>
          <caption className="sr-only">Runtime activity, newest first. Select a row to see the decision detail.</caption>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-44">Time</TableHead>
              <TableHead className="w-36">Decision</TableHead>
              <TableHead>Agent and tool</TableHead>
              <TableHead>Action and resource</TableHead>
              <TableHead className="hidden lg:table-cell">Authorization</TableHead>
              <TableHead className="w-44">Risk</TableHead>
              <TableHead className="hidden xl:table-cell">Outcome</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {events.map((event) => {
              const selected = event.requestId === selectedRequestId;
              return (
                <TableRow
                  key={event.id}
                  data-state={selected ? "selected" : undefined}
                  onClick={() => onSelect(event.requestId)}
                  className="cursor-pointer data-[state=selected]:bg-muted"
                >
                  <TableCell>
                    <button
                      type="button"
                      onClick={(click) => {
                        click.stopPropagation();
                        onSelect(event.requestId);
                      }}
                      aria-current={selected ? "true" : undefined}
                      className="rounded-sm text-left font-mono text-xs tabular-nums text-foreground underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {formatTimestamp(event.timestamp)}
                    </button>
                  </TableCell>
                  <TableCell>
                    <DecisionBadge decision={event.decision} />
                  </TableCell>
                  <TableCell className="max-w-0">
                    <p className="truncate font-mono text-xs" title={event.agentId}>
                      {event.agentId}
                    </p>
                    <p className="truncate text-xs text-muted-foreground" title={event.tool}>
                      {event.tool}
                    </p>
                  </TableCell>
                  <TableCell className="max-w-0">
                    <p className="text-sm">{ACTION_LABELS[event.action]}</p>
                    <p className="truncate font-mono text-xs text-muted-foreground" title={event.resource}>
                      {event.resource}
                    </p>
                  </TableCell>
                  <TableCell className="hidden text-sm lg:table-cell">
                    {AUTHORIZATION_LABELS[event.authorizationResult]}
                  </TableCell>
                  <TableCell>
                    <RiskScore score={event.riskScore} />
                  </TableCell>
                  <TableCell className="hidden text-sm text-muted-foreground xl:table-cell">
                    {OUTCOME_LABELS[event.actionOutcome]}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <ul className="flex flex-col gap-2 md:hidden" aria-label="Runtime activity">
        {events.map((event) => {
          const selected = event.requestId === selectedRequestId;
          return (
            <li key={event.id}>
              <button
                type="button"
                onClick={() => onSelect(event.requestId)}
                aria-current={selected ? "true" : undefined}
                className={cn(
                  "flex w-full flex-col gap-2 rounded-lg border bg-card p-3 text-left transition-colors duration-150 motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  selected && "border-foreground/30 bg-muted",
                )}
              >
                <div className="flex items-center justify-between gap-3">
                  <DecisionBadge decision={event.decision} />
                  <span className="font-mono text-xs tabular-nums text-muted-foreground">
                    {formatTimestamp(event.timestamp)}
                  </span>
                </div>
                <div className="min-w-0">
                  <p className="truncate font-mono text-xs">{event.agentId}</p>
                  <p className="truncate text-sm">
                    {ACTION_LABELS[event.action]}
                    <span className="text-muted-foreground"> on </span>
                    <span className="font-mono text-xs">{event.resource}</span>
                  </p>
                </div>
                <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
                  <span>{AUTHORIZATION_LABELS[event.authorizationResult]}</span>
                  <RiskScore score={event.riskScore} />
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
