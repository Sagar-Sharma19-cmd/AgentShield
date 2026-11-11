"use client";

import { useCallback, useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { RotateCw } from "lucide-react";
import { AgentActivity } from "@/components/agents/agent-activity";
import { AgentDetailSummary } from "@/components/agents/agent-detail-summary";
import { AgentLifecycleSection } from "@/components/agents/agent-lifecycle-section";
import { AgentLoadError } from "@/components/agents/agent-load-error";
import { AgentPermissionsPanel } from "@/components/agents/agent-permissions-panel";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { describeAgentDetailError, isAgentNotFound } from "@/lib/agents/detail-model";
import { isLeavingUnacknowledgedKey, resolveSheetAgent, type RotationHold } from "@/lib/agents/rotation-hold";
import { agentKeys, useAgent, useAgentGrants } from "@/lib/queries/agents";

/**
 * State for the agent detail, shared by the sheet (below `lg`) and the pane (from `lg` up). It is owned by the
 * workspace, not by either container, so the rotation hold and the one-time-key protections are the same in
 * both, and the workspace can keep the layout fixed while a hold is set (switching containers would remount
 * the lifecycle section and drop an unacknowledged key).
 *
 * The hold rules are unchanged from the sheet: resolveSheetAgent / isLeavingUnacknowledgedKey decide which
 * agent is shown and whether leaving needs the stay-or-discard choice.
 */
export function useAgentDetailController({
  urlAgentId,
  onClose,
  onRestoreAgent,
}: {
  urlAgentId: string | undefined;
  onClose: () => void;
  onRestoreAgent: (agentId: string) => void;
}) {
  const queryClient = useQueryClient();
  // Set by the lifecycle section while a key rotation is pending or its key is on screen.
  const [hold, setHold] = useState<RotationHold | null>(null);
  // Set when the operator tries to leave while a key is unacknowledged (Escape, outside click, close).
  const [leaveRequested, setLeaveRequested] = useState(false);
  // Stable identity matters: the section's unmount cleanup calls the callback it was given.
  const reportHold = useCallback((next: RotationHold | null) => {
    setHold(next);
    setLeaveRequested(false);
  }, []);
  const { shownAgentId: agentId, dismissBlocked } = resolveSheetAgent(urlAgentId, hold);
  const leaving = isLeavingUnacknowledgedKey(urlAgentId, hold, leaveRequested);
  const detail = useAgent(agentId);
  const grants = useAgentGrants(agentId);
  const notFound = detail.isError && isAgentNotFound(detail.error);

  // A missing agent means the registry list is stale. Refresh only the registry, so the row goes away.
  useEffect(() => {
    if (notFound) void queryClient.invalidateQueries({ queryKey: agentKeys.registry() });
  }, [notFound, queryClient]);

  function requestLeave() {
    if (hold?.keyOpen) setLeaveRequested(true);
  }

  function stayOnKey() {
    setLeaveRequested(false);
    if (hold && urlAgentId !== hold.agentId) onRestoreAgent(hold.agentId);
  }

  /** Close, Escape or outside click: blocked while a rotation is pending; asks first while a key is open. */
  function requestClose() {
    if (dismissBlocked) return;
    if (hold?.keyOpen) requestLeave();
    else onClose();
  }

  return {
    agentId,
    hold,
    dismissBlocked,
    leaving,
    detail,
    grants,
    notFound,
    reportHold,
    requestLeave,
    stayOnKey,
    requestClose,
    onClose,
  };
}

export type AgentDetailController = ReturnType<typeof useAgentDetailController>;

/**
 * Detail content: identity, lifecycle, permissions and recent activity. `showTitle` renders the agent name as
 * the heading; the sheet passes false because its SheetTitle already names the agent.
 */
export function AgentDetailBody({ controller, showTitle }: { controller: AgentDetailController; showTitle: boolean }) {
  const { agentId, detail, grants, notFound, dismissBlocked, leaving } = controller;
  if (agentId === undefined) return null;

  return (
    <div className="flex flex-col gap-6">
      {dismissBlocked && (
        <p role="status" className="rounded-md border border-border bg-muted/40 p-3 text-sm">
          Key rotation in progress. This panel stays open until AgentShield responds.
        </p>
      )}
      {notFound ? (
        <AgentNotFound onClose={controller.onClose} />
      ) : (
        <>
          {detail.data ? (
            <>
              <AgentDetailSummary agent={detail.data} refreshing={detail.isFetching} showTitle={showTitle} />
              <AgentLifecycleSection
                key={detail.data.id}
                agent={detail.data}
                onHoldChange={controller.reportHold}
                leaveConfirmOpen={leaving}
                onLeaveAttempt={controller.requestLeave}
                onStayOnKey={controller.stayOnKey}
                onDiscardKey={controller.onClose}
              />
            </>
          ) : detail.isError ? (
            <AgentLoadError copy={describeAgentDetailError(detail.error, "agent")} onRetry={() => void detail.refetch()} />
          ) : (
            <DetailSkeleton />
          )}

          <AgentPermissionsPanel
            agentId={agentId}
            agentName={detail.data?.name ?? "this agent"}
            status={detail.data?.status}
            grants={grants}
          />

          {detail.data && <AgentActivity agentName={detail.data.name} />}
        </>
      )}
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true" aria-label="Loading agent details">
      <div className="flex justify-between">
        <Skeleton className="h-7 w-28" />
        <Skeleton className="h-5 w-32" />
      </div>
      <Skeleton className="h-6 w-2/3" />
      <Skeleton className="h-16 w-full" />
      <Skeleton className="h-24 w-full" />
    </div>
  );
}

function AgentNotFound({ onClose }: { onClose: () => void }) {
  return (
    <div role="alert" className="flex flex-col gap-3 rounded-lg border border-danger/30 bg-danger/5 p-4">
      <p className="text-sm font-medium text-danger-text">This agent is no longer in the registry</p>
      <p className="text-xs text-muted-foreground">
        It may have been removed, or the link is out of date. The registry has been refreshed.
      </p>
      <div>
        <Button variant="outline" size="sm" onClick={onClose}>
          <RotateCw aria-hidden="true" />
          Back to the registry
        </Button>
      </div>
    </div>
  );
}
