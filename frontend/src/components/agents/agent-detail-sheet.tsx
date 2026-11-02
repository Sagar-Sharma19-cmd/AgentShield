"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowRight, RotateCw } from "lucide-react";
import { AgentDetailSummary } from "@/components/agents/agent-detail-summary";
import { AgentPermissionsPanel } from "@/components/agents/agent-permissions-panel";
import { AgentLifecycleSection } from "@/components/agents/agent-lifecycle-section";
import { AgentLoadError } from "@/components/agents/agent-load-error";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { buildAgentActivityHref, describeAgentDetailError, isAgentNotFound } from "@/lib/agents/detail-model";
import {
  isLeavingUnacknowledgedKey,
  type RotationHold,
  resolveSheetAgent,
} from "@/lib/agents/rotation-hold";
import { agentKeys, useAgent, useAgentGrants } from "@/lib/queries/agents";

/** Id of the page heading. Focus lands here when no registry row for the agent is visible. */
export const AGENTS_PAGE_HEADING_ID = "agents-page-heading";

/**
 * The registry trigger for an agent that is actually on screen. The table and the cards both
 * render every row, and one of them is hidden at each breakpoint, so the first match is not enough.
 */
function findVisibleRegistryTrigger(agentId: string): HTMLElement | null {
  const candidates = document.querySelectorAll<HTMLElement>(`[data-agent-id="${CSS.escape(agentId)}"]`);
  return Array.from(candidates).find((element) => element.getClientRects().length > 0) ?? null;
}

interface AgentDetailSheetProps {
  /** Selected agent id from the URL. The sheet is open whenever this is set. */
  agentId: string | undefined;
  onClose: () => void;
  /** Puts the URL back on an agent whose unacknowledged key the operator chose to keep. */
  onRestoreAgent: (agentId: string) => void;
}

/**
 * Read-only detail for one agent, opened from the registry. The detail request is authoritative;
 * the registry row only fills the header while it loads. Grants load independently.
 */
export function AgentDetailSheet({ agentId: urlAgentId, onClose, onRestoreAgent }: AgentDetailSheetProps) {
  const queryClient = useQueryClient();
  // Set by the lifecycle section while a key rotation is pending or its key is on screen. It keeps the
  // sheet on the same agent and blocks dismissal, so Back or Escape cannot discard that key.
  const [hold, setHold] = useState<RotationHold | null>(null);
  // Set when the operator tries to leave while a key is unacknowledged (Escape, outside click, close).
  // Back or a URL change is detected from the hold itself, so it needs no extra state.
  const [leaveRequested, setLeaveRequested] = useState(false);
  // Stable identity matters: the section's unmount cleanup calls the callback it was given.
  const reportHold = useCallback((next: RotationHold | null) => {
    setHold(next);
    setLeaveRequested(false);
  }, []);
  const { shownAgentId: agentId, dismissBlocked } = resolveSheetAgent(urlAgentId, hold);
  const leaving = isLeavingUnacknowledgedKey(urlAgentId, hold, leaveRequested);

  function requestLeave() {
    if (hold?.keyOpen) setLeaveRequested(true);
  }

  function stayOnKey() {
    setLeaveRequested(false);
    if (hold && urlAgentId !== hold.agentId) onRestoreAgent(hold.agentId);
  }
  const detail = useAgent(agentId);
  const grants = useAgentGrants(agentId);
  const notFound = detail.isError && isAgentNotFound(detail.error);
  // Radix returns focus only to a Dialog.Trigger, and this sheet is opened by URL state with none.
  // The id is kept here because the close handler runs after `agentId` has already been cleared.
  const openedAgentId = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (agentId !== undefined) openedAgentId.current = agentId;
  }, [agentId]);

  function restoreFocusAfterClose(event: Event) {
    event.preventDefault();
    const trigger = openedAgentId.current ? findVisibleRegistryTrigger(openedAgentId.current) : null;
    (trigger ?? document.getElementById(AGENTS_PAGE_HEADING_ID))?.focus();
  }

  // A missing agent means the registry list is stale. Refresh only the registry, so the row goes away.
  useEffect(() => {
    if (notFound) void queryClient.invalidateQueries({ queryKey: agentKeys.registry() });
  }, [notFound, queryClient]);

  return (
    <Sheet
      open={agentId !== undefined}
      onOpenChange={(open) => {
        if (open || dismissBlocked) return;
        // An unacknowledged key must not be dropped by a close: ask first.
        if (hold?.keyOpen) requestLeave();
        else onClose();
      }}
    >
      <SheetContent
        onCloseAutoFocus={restoreFocusAfterClose}
        showCloseButton={!dismissBlocked}
        className="w-full overflow-y-auto data-[side=right]:w-full sm:max-w-xl data-[side=right]:sm:max-w-xl"
      >
        <SheetHeader className="pr-10">
          <SheetTitle>{detail.data?.name ?? "Agent details"}</SheetTitle>
          <SheetDescription className="font-mono text-xs break-all">{agentId}</SheetDescription>
        </SheetHeader>

        <div className="flex flex-col gap-6 px-4 pb-6">
          {dismissBlocked && (
            <p role="status" className="rounded-md border border-border bg-muted/40 p-3 text-sm">
              Key rotation in progress. This panel stays open until AgentShield responds.
            </p>
          )}
          {notFound ? (
            <AgentNotFound onClose={onClose} />
          ) : (
            <>
              {detail.data ? (
                <>
                  <AgentDetailSummary agent={detail.data} refreshing={detail.isFetching} />
                  <AgentLifecycleSection
                    key={detail.data.id}
                    agent={detail.data}
                    onHoldChange={reportHold}
                    leaveConfirmOpen={leaving}
                    onLeaveAttempt={requestLeave}
                    onStayOnKey={stayOnKey}
                    onDiscardKey={onClose}
                  />
                </>
              ) : detail.isError ? (
                <AgentLoadError
                  copy={describeAgentDetailError(detail.error, "agent")}
                  onRetry={() => void detail.refetch()}
                />
              ) : (
                <DetailSkeleton />
              )}

              {agentId && (
                <AgentPermissionsPanel
                  agentId={agentId}
                  agentName={detail.data?.name ?? "this agent"}
                  status={detail.data?.status}
                  grants={grants}
                />
              )}

              {agentId && (
                <div>
                  <Button asChild variant="outline" size="sm">
                    <Link href={buildAgentActivityHref(agentId)}>
                      Open in Activity
                      <ArrowRight aria-hidden="true" />
                    </Link>
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function DetailSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true" aria-label="Loading agent details">
      <Skeleton className="h-6 w-28" />
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
