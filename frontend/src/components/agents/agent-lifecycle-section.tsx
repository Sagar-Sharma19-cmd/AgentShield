"use client";

import { useCallback, useEffect, useReducer, useState } from "react";
import { AgentLifecycleConfirmDialog } from "@/components/agents/agent-lifecycle-confirm-dialog";
import { OneTimeKeyDialog } from "@/components/agents/one-time-key-dialog";
import { Button } from "@/components/ui/button";
import { useAdminKey } from "@/lib/auth/admin-key";
import { describeAgentActionError } from "@/lib/agents/detail-model";
import { availableLifecycleActions, targetStatusFor, type LifecycleAction } from "@/lib/agents/lifecycle";
import { LIFECYCLE_BUTTON_LABELS } from "@/lib/agents/lifecycle-copy";
import { keyForAgent, oneTimeKeyReducer } from "@/lib/agents/one-time-key";
import type { RotationHold } from "@/lib/agents/rotation-hold";
import { type IssuedAgentKey, useRotateAgentKey, useUpdateAgentStatus } from "@/lib/queries/agents";
import type { AgentResponse } from "@/types/api";

interface AgentLifecycleSectionProps {
  agent: AgentResponse;
  /**
   * Tells the parent sheet when a key rotation is pending or its key is on screen, so the sheet
   * cannot be dismissed (or navigated away from) and lose that key. Unrelated actions never report.
   */
  onHoldChange?: (hold: RotationHold | null) => void;
  /** The sheet decided the operator is leaving while a key is unacknowledged. Shows the leave confirmation. */
  leaveConfirmOpen?: boolean;
  /** Escape or outside click on the key dialog: ask the sheet to show the leave confirmation. */
  onLeaveAttempt?: () => void;
  /** "Stay and save the key": the sheet clears its leave request and restores the URL if it moved. */
  onStayOnKey?: () => void;
  /** "Leave and discard the key": the key has already been dropped here. The sheet now closes. */
  onDiscardKey?: () => void;
}

/**
 * Lifecycle controls for one agent. The available actions come from the approved matrix in
 * lifecycle.ts; this component only decides what to show, not what is allowed.
 *
 * The parent renders it with `key={agent.id}`, so switching agents unmounts it and drops any key.
 * The plaintext key lives only in this component's reducer state. Lock clears that state here, so
 * the key does not depend on the parent happening to unmount. Only the explicit discard choice,
 * acknowledgement, or a lock can clear it.
 */
export function AgentLifecycleSection({
  agent,
  onHoldChange,
  leaveConfirmOpen = false,
  onLeaveAttempt,
  onStayOnKey,
  onDiscardKey,
}: AgentLifecycleSectionProps) {
  const { isUnlocked } = useAdminKey();
  const [confirming, setConfirming] = useState<LifecycleAction | null>(null);
  const [typedName, setTypedName] = useState("");
  const [issuedKey, dispatchKey] = useReducer(oneTimeKeyReducer, null);

  const statusChange = useUpdateAgentStatus();
  const handleKeyIssued = useCallback(
    (issued: IssuedAgentKey) => {
      dispatchKey({ type: "issued", issued });
      onHoldChange?.({ agentId: issued.agentId, pending: false, keyOpen: true });
    },
    [onHoldChange],
  );
  const rotation = useRotateAgentKey(agent.id, handleKeyIssued);

  // Lock: drop the held key and any hold on the sheet, regardless of what the parent does.
  useEffect(() => {
    if (isUnlocked) return;
    dispatchKey({ type: "session-locked" });
    onHoldChange?.(null);
  }, [isUnlocked, onHoldChange]);

  // If this section goes away while a hold is set, release the hold so the sheet cannot stay pinned.
  useEffect(() => () => onHoldChange?.(null), [onHoldChange]);

  const actions = availableLifecycleActions(agent.status);
  const busy = statusChange.isPending || rotation.isPending;
  const activeError = statusChange.isError
    ? describeAgentActionError(statusChange.error)
    : rotation.isError
      ? describeAgentActionError(rotation.error)
      : null;
  const visibleKey = isUnlocked ? keyForAgent(issuedKey, agent.id) : null;

  function openConfirmation(action: LifecycleAction) {
    statusChange.reset();
    rotation.reset();
    setTypedName("");
    setConfirming(action);
  }

  function closeConfirmation() {
    setConfirming(null);
    setTypedName("");
  }

  function confirm() {
    if (confirming === null) return;
    if (confirming === "rotate") {
      // Hold the sheet before the request starts, so Back or dismissal during the request is blocked.
      onHoldChange?.({ agentId: agent.id, pending: true, keyOpen: false });
      rotation.mutate(undefined, {
        onSuccess: closeConfirmation,
        onError: () => onHoldChange?.(null),
      });
      return;
    }
    const status = targetStatusFor(confirming);
    if (status === null) return;
    statusChange.mutate({ id: agent.id, status }, { onSuccess: closeConfirmation });
  }

  function acknowledgeKey() {
    dispatchKey({ type: "acknowledged" });
    onHoldChange?.(null);
  }

  function discardKey() {
    // Drop the only displayed copy first, then let the sheet close.
    dispatchKey({ type: "discarded" });
    onHoldChange?.(null);
    onDiscardKey?.();
  }

  return (
    <section aria-labelledby="agent-lifecycle-heading" className="flex flex-col gap-3">
      <h3 id="agent-lifecycle-heading" className="text-sm font-medium">
        Lifecycle
      </h3>

      {actions.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          This agent is revoked. Its key was destroyed, so no lifecycle changes are available.
        </p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {actions.map((action) => (
            <Button
              key={action}
              variant={action === "revoke" ? "destructive" : "outline"}
              size="sm"
              disabled={busy}
              onClick={() => openConfirmation(action)}
            >
              {LIFECYCLE_BUTTON_LABELS[action]}
            </Button>
          ))}
        </div>
      )}

      <p role="status" aria-live="polite" className="text-xs text-muted-foreground">
        {statusChange.isPending && "Saving the status change."}
        {rotation.isPending && "Issuing a new key."}
      </p>

      <AgentLifecycleConfirmDialog
        action={confirming}
        agentName={agent.name}
        status={agent.status}
        typedName={typedName}
        onTypedNameChange={setTypedName}
        pending={busy}
        errorMessage={activeError}
        onConfirm={confirm}
        onClose={closeConfirmation}
      />

      {visibleKey !== null && (
        <OneTimeKeyDialog
          agentName={agent.name}
          apiKey={visibleKey}
          leaveConfirmOpen={leaveConfirmOpen}
          onAcknowledge={acknowledgeKey}
          onLeaveAttempt={() => onLeaveAttempt?.()}
          onStayOnKey={() => onStayOnKey?.()}
          onDiscardKey={discardKey}
        />
      )}
    </section>
  );
}
