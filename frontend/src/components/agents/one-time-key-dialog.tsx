"use client";

import { useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface OneTimeKeyDialogProps {
  agentName: string;
  /** Wording only. "rotate" replaces an existing key; "register" creates the agent's first key. */
  mode?: "rotate" | "register";
  /**
   * The plaintext key, held only by the parent's local state. It is not stored anywhere else: not in
   * query or mutation state, the URL, storage or logs. Clearing that state (onAcknowledge) removes it.
   */
  apiKey: string;
  /**
   * Swaps the key for the stay-or-discard view. It is a view inside this one dialog, not a second modal:
   * stacking a second Radix modal hides the first from assistive technology. The key is not rendered
   * while this is set.
   */
  leaveConfirmOpen: boolean;
  /** The only way to close the key view. The parent must drop its copy of the key here. */
  onAcknowledge: () => void;
  /** Escape or an outside click while the key is shown: switch to the leave view. */
  onLeaveAttempt: () => void;
  /** "Stay and save the key". Escape or an outside click in the leave view also stays. */
  onStayOnKey: () => void;
  /** "Leave and discard the key". The parent drops its copy of the key and closes the sheet. */
  onDiscardKey: () => void;
}

type CopyState = "idle" | "copied" | "failed";

/**
 * Shows a newly issued API key exactly once. It closes only through the acknowledgement button, or
 * through the explicit discard choice in the leave view. The parent owns the key.
 */
export function OneTimeKeyDialog({
  agentName,
  mode = "rotate",
  apiKey,
  leaveConfirmOpen,
  onAcknowledge,
  onLeaveAttempt,
  onStayOnKey,
  onDiscardKey,
}: OneTimeKeyDialogProps) {
  const [copyState, setCopyState] = useState<CopyState>("idle");

  // Never closes the dialog. Escape and outside clicks ask first; the leave view treats them as "stay".
  function requestLeave(event: Event) {
    event.preventDefault();
    if (leaveConfirmOpen) onStayOnKey();
    else onLeaveAttempt();
  }

  async function copyKey() {
    try {
      await navigator.clipboard.writeText(apiKey);
      setCopyState("copied");
    } catch {
      // The failure is reported to the operator without the error, which could carry request detail.
      setCopyState("failed");
    }
  }

  return (
    <Dialog open>
      <DialogContent
        showCloseButton={false}
        onEscapeKeyDown={requestLeave}
        onPointerDownOutside={requestLeave}
        onInteractOutside={requestLeave}
        className="sm:max-w-md"
      >
        {leaveConfirmOpen ? (
          <>
            <DialogHeader>
              <DialogTitle>Leave without saving this key?</DialogTitle>
              <DialogDescription>
                {mode === "register" ? (
                  <>
                    {agentName}&apos;s API key is shown only once. Leaving will permanently discard the only displayed
                    copy. If the key is lost, you will need to rotate it to get a new one.
                  </>
                ) : (
                  <>
                    AgentShield has already rotated {agentName}&apos;s API key, and the previous key no longer works.
                    This new key is shown only once. Leaving will permanently discard the only displayed copy. If the
                    key is lost, you will need to rotate the key again.
                  </>
                )}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="destructive" onClick={onDiscardKey}>
                Leave and discard the key
              </Button>
              <Button autoFocus onClick={onStayOnKey}>
                Stay and save the key
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>New API key for {agentName}</DialogTitle>
              <DialogDescription>
                This key is shown only once. Copy it now and store it where the agent can read it. It cannot be shown
                again.
              </DialogDescription>
            </DialogHeader>

            <div className="flex flex-col gap-2">
              <label htmlFor="one-time-api-key" className="text-xs font-medium text-muted-foreground">
                API key
              </label>
              <input
                id="one-time-api-key"
                readOnly
                value={apiKey}
                spellCheck={false}
                autoComplete="off"
                onFocus={(event) => event.currentTarget.select()}
                className="w-full min-w-0 rounded-md border border-input bg-muted/40 px-2.5 py-2 font-mono text-xs break-all outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
              />
              <div className="flex flex-wrap items-center gap-3">
                <Button variant="outline" size="sm" onClick={() => void copyKey()}>
                  Copy key
                </Button>
                <p role="status" aria-live="polite" className="text-xs text-muted-foreground">
                  {copyState === "copied" && "Copied. The key is in your clipboard until you replace it."}
                  {copyState === "failed" && "Copy failed. Select the key above and copy it manually."}
                </p>
              </div>
            </div>

            <Alert>
              <AlertTitle>AgentShield cannot clear your clipboard</AlertTitle>
              <AlertDescription>
                After you copy the key, clear the clipboard yourself once it is stored.
                {mode === "rotate" && " The previous key stopped working when this one was issued."}
              </AlertDescription>
            </Alert>

            <DialogFooter>
              <Button onClick={onAcknowledge}>I have saved this key</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
