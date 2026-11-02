"use client";

import { useState } from "react";
import { Power, PowerOff } from "lucide-react";
import { RegisterToolButton } from "@/components/tools/register-tool-dialog";
import { ToolStatusBadge } from "@/components/tools/tool-status-badge";
import { DashboardCard, SectionEmpty, SectionError, SectionSkeleton } from "@/components/dashboard/section-states";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatTimestamp } from "@/lib/format";
import { useToolsList, useUpdateToolStatus } from "@/lib/queries/tools";
import { describeToolDisableEffect, TOOL_TYPE_LABELS } from "@/lib/tools/model";
import type { ToolResponse } from "@/types/api";

/**
 * Tool registry. Enabling and disabling a tool changes what every agent can reach, so disabling asks
 * first and says what it does. Grants are managed from each agent's detail panel.
 */
export function ToolsWorkspace() {
  const tools = useToolsList();
  const updateStatus = useUpdateToolStatus();
  const [disableTarget, setDisableTarget] = useState<ToolResponse | null>(null);

  function setEnabled(tool: ToolResponse, enable: boolean) {
    if (enable) {
      updateStatus.mutate({ id: tool.id, status: "ACTIVE" });
    } else {
      setDisableTarget(tool);
    }
  }

  function confirmDisable() {
    if (!disableTarget) return;
    updateStatus.mutate({ id: disableTarget.id, status: "DISABLED" }, { onSettled: () => setDisableTarget(null) });
  }

  const list = tools.data;

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-5 p-4 md:p-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="font-heading text-2xl font-semibold tracking-tight">Tools</h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Systems an agent can call through the gateway. Registering a tool does not grant access; grant each agent
            the tools and actions it needs from its detail panel.
          </p>
        </div>
        <RegisterToolButton />
      </header>

      <DashboardCard
        title="Tool registry"
        description={list ? `${list.length} registered, ${list.filter((tool) => tool.status === "ACTIVE").length} active.` : "Loading the registry."}
      >
        {tools.isPending ? (
          <SectionSkeleton label="Loading tools" rows={4} />
        ) : tools.isError ? (
          <SectionError error={tools.error} onRetry={() => void tools.refetch()} subject="the tool registry" />
        ) : list && list.length === 0 ? (
          <SectionEmpty title="No tools registered" body="Register a tool, then grant agents access to it." />
        ) : list ? (
          <div className="-mx-4 overflow-x-auto px-4 md:-mx-6 md:px-6">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="hidden lg:table-cell">Updated</TableHead>
                  <TableHead className="text-right">
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.map((tool) => (
                  <TableRow key={tool.id}>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-mono text-sm">{tool.name}</span>
                        {tool.description && (
                          <span className="max-w-xs truncate text-xs text-muted-foreground">{tool.description}</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">{TOOL_TYPE_LABELS[tool.toolType]}</TableCell>
                    <TableCell>
                      <ToolStatusBadge status={tool.status} />
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      <time dateTime={tool.updatedAt} className="font-mono text-xs tabular-nums text-muted-foreground">
                        {formatTimestamp(tool.updatedAt)}
                      </time>
                    </TableCell>
                    <TableCell className="text-right">
                      {tool.status === "ACTIVE" ? (
                        <Button variant="outline" size="sm" onClick={() => setEnabled(tool, false)} disabled={updateStatus.isPending}>
                          <PowerOff aria-hidden="true" />
                          Disable<span className="sr-only"> {tool.name}</span>
                        </Button>
                      ) : (
                        <Button variant="outline" size="sm" onClick={() => setEnabled(tool, true)} disabled={updateStatus.isPending}>
                          <Power aria-hidden="true" />
                          Enable<span className="sr-only"> {tool.name}</span>
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : null}
      </DashboardCard>

      <AlertDialog open={disableTarget !== null} onOpenChange={(open) => !open && !updateStatus.isPending && setDisableTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disable {disableTarget?.name}?</AlertDialogTitle>
            <AlertDialogDescription>{disableTarget && describeToolDisableEffect(disableTarget.name)}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button variant="outline" onClick={() => setDisableTarget(null)} disabled={updateStatus.isPending}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmDisable} disabled={updateStatus.isPending}>
              {updateStatus.isPending ? "Disabling" : "Disable tool"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
