"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowRight, RotateCw } from "lucide-react";
import { AgentDetailSummary } from "@/components/agents/agent-detail-summary";
import { AgentGrantsSection } from "@/components/agents/agent-grants-section";
import { AgentLoadError } from "@/components/agents/agent-load-error";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { buildAgentActivityHref, describeAgentDetailError, isAgentNotFound } from "@/lib/agents/detail-model";
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
}

/**
 * Read-only detail for one agent, opened from the registry. The detail request is authoritative;
 * the registry row only fills the header while it loads. Grants load independently.
 */
export function AgentDetailSheet({ agentId, onClose }: AgentDetailSheetProps) {
  const queryClient = useQueryClient();
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
    <Sheet open={agentId !== undefined} onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        onCloseAutoFocus={restoreFocusAfterClose}
        className="w-full overflow-y-auto data-[side=right]:w-full sm:max-w-xl data-[side=right]:sm:max-w-xl"
      >
        <SheetHeader className="pr-10">
          <SheetTitle>{detail.data?.name ?? "Agent details"}</SheetTitle>
          <SheetDescription className="font-mono text-xs break-all">{agentId}</SheetDescription>
        </SheetHeader>

        <div className="flex flex-col gap-6 px-4 pb-6">
          {notFound ? (
            <AgentNotFound onClose={onClose} />
          ) : (
            <>
              {detail.data ? (
                <AgentDetailSummary agent={detail.data} refreshing={detail.isFetching} />
              ) : detail.isError ? (
                <AgentLoadError
                  copy={describeAgentDetailError(detail.error, "agent")}
                  onRetry={() => void detail.refetch()}
                />
              ) : (
                <DetailSkeleton />
              )}

              <AgentGrantsSection
                grants={grants.data}
                isPending={grants.isPending}
                isError={grants.isError}
                error={grants.error}
                onRetry={() => void grants.refetch()}
                status={detail.data?.status}
              />

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
