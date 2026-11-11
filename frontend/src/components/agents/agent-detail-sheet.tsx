"use client";

import { useEffect, useRef } from "react";
import { AgentDetailBody, type AgentDetailController } from "@/components/agents/agent-detail";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";

/** Id of the page heading. Focus lands here when no registry row for the agent is visible. */
export const AGENTS_PAGE_HEADING_ID = "agents-page-heading";

/**
 * The registry trigger for an agent that is actually on screen. The table and the cards both
 * render every row, and one of them is hidden at each breakpoint, so the first match is not enough.
 */
export function findVisibleRegistryTrigger(agentId: string): HTMLElement | null {
  const candidates = document.querySelectorAll<HTMLElement>(`[data-agent-id="${CSS.escape(agentId)}"]`);
  return Array.from(candidates).find((element) => element.getClientRects().length > 0) ?? null;
}

/**
 * Agent detail as a sheet, used below `lg`. The state (including the rotation hold that blocks dismissal
 * while a key is pending or unacknowledged) comes from the workspace's useAgentDetailController.
 */
export function AgentDetailSheet({ controller }: { controller: AgentDetailController }) {
  const { agentId, detail, dismissBlocked } = controller;
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

  return (
    <Sheet
      open={agentId !== undefined}
      onOpenChange={(open) => {
        if (!open) controller.requestClose();
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
        <div className="px-4 pb-6">
          <AgentDetailBody controller={controller} showTitle={false} />
        </div>
      </SheetContent>
    </Sheet>
  );
}
