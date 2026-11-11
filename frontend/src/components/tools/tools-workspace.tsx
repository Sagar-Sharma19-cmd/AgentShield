"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { RotateCw, Search, Wrench } from "lucide-react";
import { RegisterToolButton } from "@/components/tools/register-tool-dialog";
import { ToolStatusBadge } from "@/components/tools/tool-status-badge";
import { ToolTypeIcon } from "@/components/tools/tool-type-icon";
import { SectionError } from "@/components/dashboard/section-states";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatTimestamp } from "@/lib/format";
import { toolKeys, useToolsList, useUpdateToolStatus } from "@/lib/queries/tools";
import { describeToolDisableEffect, TOOL_TYPE_LABELS } from "@/lib/tools/model";
import {
  TOOL_STATUS_FILTER_LABELS,
  TOOL_STATUS_FILTERS,
  countToolsByStatus,
  visibleTools,
  type ToolStatusFilter,
} from "@/lib/tools/registry";
import type { ToolResponse } from "@/types/api";

const EYEBROW = "font-mono text-[0.6875rem] tracking-[0.08em] text-muted-foreground uppercase";

/**
 * Tool registry ("Checkpoint" language). Each tool is a row with its type, status and an enable switch.
 * Enabling uses the existing status endpoint directly, as before. Disabling asks first, because every
 * agent that uses the tool is then denied at the Permission gate. Grants are managed per agent.
 *
 * There is no "used by" count: the API lists grants per agent only, so a count would need one request per
 * agent, and this page loads none of them.
 */
export function ToolsWorkspace() {
  const queryClient = useQueryClient();
  const tools = useToolsList();
  const updateStatus = useUpdateToolStatus();
  const [disableTarget, setDisableTarget] = useState<ToolResponse | null>(null);
  const [status, setStatus] = useState<ToolStatusFilter>("ALL");
  const [search, setSearch] = useState("");

  function onToggle(tool: ToolResponse, enable: boolean) {
    if (enable) updateStatus.mutate({ id: tool.id, status: "ACTIVE" });
    else setDisableTarget(tool);
  }

  function confirmDisable() {
    if (!disableTarget) return;
    updateStatus.mutate({ id: disableTarget.id, status: "DISABLED" }, { onSettled: () => setDisableTarget(null) });
  }

  const list = tools.data;
  const counts = list ? countToolsByStatus(list) : undefined;
  const visible = list ? visibleTools(list, { search, status }) : [];
  const pendingId = updateStatus.isPending ? updateStatus.variables?.id : undefined;

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-5 p-4 md:p-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <p className={EYEBROW}>Configure · Permission gate</p>
          <h1 className="text-2xl font-semibold tracking-tight">Tools</h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Systems an agent can call through the gateway. Registering a tool grants nothing: each agent needs its own
            grant, made from its detail panel on the Agents page.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={tools.isFetching}
            onClick={() => void queryClient.invalidateQueries({ queryKey: toolKeys.list() })}
          >
            <RotateCw aria-hidden="true" className={tools.isFetching ? "animate-spin motion-reduce:animate-none" : undefined} />
            Refresh
          </Button>
          <RegisterToolButton />
        </div>
      </header>

      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <Tabs value={status} onValueChange={(value) => setStatus(value as ToolStatusFilter)}>
          <TabsList aria-label="Filter tools by status" className="flex h-auto w-full flex-wrap justify-start">
            {TOOL_STATUS_FILTERS.map((filter) => (
              <TabsTrigger key={filter} value={filter} className="gap-2">
                {TOOL_STATUS_FILTER_LABELS[filter]}
                <span className="font-mono text-xs tabular-nums text-muted-foreground">
                  <span className="sr-only">, </span>
                  {counts ? counts[filter] : "–"}
                </span>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <div className="relative w-full md:w-72">
          <Search aria-hidden="true" className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            aria-label="Search tools by name or description"
            placeholder="Search name or description"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="pl-8"
          />
        </div>
      </div>

      <section aria-labelledby="tool-registry-heading" className="flex flex-col gap-2">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="tool-registry-heading" className={EYEBROW}>
            Tool registry
          </h2>
          {list && (
            <p className="font-mono text-xs tabular-nums text-muted-foreground">
              {visible.length} of {list.length} shown · {counts?.ACTIVE ?? 0} active
            </p>
          )}
        </div>

        {tools.isPending ? (
          <RegistrySkeleton />
        ) : !list ? (
          <SectionError
            error={tools.error ?? new Error("The tool registry could not be loaded.")}
            onRetry={() => void tools.refetch()}
            subject="the tool registry"
          />
        ) : list.length === 0 ? (
          <RegistryEmpty />
        ) : visible.length === 0 ? (
          <div className="flex flex-col items-start gap-3 rounded-lg border border-dashed border-border px-4 py-6">
            <p className="text-sm font-medium">No tools match</p>
            <p className="text-sm text-muted-foreground">Try a different search, or choose another status.</p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setSearch("");
                setStatus("ALL");
              }}
            >
              Clear search and filter
            </Button>
          </div>
        ) : (
          <ul aria-label="Registered tools" className="flex flex-col divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
            {visible.map((tool) => (
              <ToolRow
                key={tool.id}
                tool={tool}
                pending={pendingId === tool.id}
                disabled={updateStatus.isPending}
                onToggle={(enable) => onToggle(tool, enable)}
              />
            ))}
          </ul>
        )}
        {tools.isError && list && (
          <p role="status" className="text-xs text-muted-foreground">
            The registry could not be refreshed. The list above is the last one loaded.
          </p>
        )}
      </section>

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

function ToolRow({
  tool,
  pending,
  disabled,
  onToggle,
}: {
  tool: ToolResponse;
  pending: boolean;
  disabled: boolean;
  onToggle: (enable: boolean) => void;
}) {
  const hintId = `tool-switch-hint-${tool.id}`;
  const active = tool.status === "ACTIVE";
  return (
    <li className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:gap-4">
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <ToolTypeIcon type={tool.toolType} />
        <div className="flex min-w-0 flex-col gap-0.5">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="truncate font-mono text-sm font-medium">{tool.name}</span>
            <span className="text-xs text-muted-foreground">{TOOL_TYPE_LABELS[tool.toolType]}</span>
          </div>
          <p className="line-clamp-2 text-xs text-muted-foreground">{tool.description ?? "No description"}</p>
          <p className="font-mono text-[0.6875rem] tabular-nums text-muted-foreground">
            Updated <time dateTime={tool.updatedAt}>{formatTimestamp(tool.updatedAt)}</time>
          </p>
        </div>
      </div>
      <div className="flex items-center justify-between gap-4 sm:justify-end">
        <ToolStatusBadge status={tool.status} />
        <div className="flex items-center gap-2">
          <span aria-hidden="true" className="text-xs text-muted-foreground">
            {pending ? (active ? "Disabling" : "Enabling") : "Enabled"}
          </span>
          <Switch
            checked={active}
            disabled={disabled}
            aria-label={`${tool.name} enabled`}
            aria-describedby={hintId}
            onCheckedChange={onToggle}
          />
          <span id={hintId} className="sr-only">
            {active
              ? "Turning this off asks for confirmation. Every agent that uses it would then be denied at the Permission gate."
              : "Disabled: requests to this tool are denied at the Permission gate."}
          </span>
        </div>
      </div>
    </li>
  );
}

function RegistryEmpty() {
  return (
    <div className="flex flex-col items-start gap-3 rounded-lg border border-dashed border-border px-4 py-6">
      <Wrench aria-hidden="true" className="size-4 text-muted-foreground" />
      <p className="text-sm font-medium">No tools registered</p>
      <p className="max-w-md text-sm text-muted-foreground">
        A tool is a system an agent calls through the gateway, such as a filesystem, a database or a build server. The
        gateway denies requests to a tool it does not know (TOOL_NOT_FOUND), so register each one, then grant agents the
        actions they need.
      </p>
      <RegisterToolButton />
    </div>
  );
}

function RegistrySkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading tools" className="flex flex-col divide-y divide-border overflow-hidden rounded-lg border border-border">
      {Array.from({ length: 4 }, (_, index) => (
        <div key={index} className="flex items-center gap-3 px-4 py-3">
          <Skeleton className="size-8" />
          <div className="flex flex-1 flex-col gap-1.5">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-2/3" />
          </div>
          <Skeleton className="h-6 w-20" />
          <Skeleton className="h-5 w-9" />
        </div>
      ))}
    </div>
  );
}
