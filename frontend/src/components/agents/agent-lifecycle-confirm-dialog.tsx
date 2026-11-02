"use client";

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { canConfirmLifecycleAction, lifecycleConfirmCopy } from "@/lib/agents/lifecycle-copy";
import type { LifecycleAction } from "@/lib/agents/lifecycle";
import type { AgentStatus } from "@/types/api";

interface AgentLifecycleConfirmDialogProps {
  /** Null when no confirmation is open. */
  action: LifecycleAction | null;
  agentName: string;
  status: AgentStatus;
  typedName: string;
  onTypedNameChange: (value: string) => void;
  pending: boolean;
  /** Safe, already-sanitised message for a failed attempt. The dialog stays open to show it. */
  errorMessage: string | null;
  onConfirm: () => void;
  onClose: () => void;
}

/**
 * Confirmation for suspend, reactivate, revoke and rotate. The confirm button is a plain Button, not
 * AlertDialogAction, because AlertDialogAction closes the dialog on click and a failed change must
 * leave the operator on the dialog. Dismissal (Escape, overlay, Cancel) is blocked while pending.
 */
export function AgentLifecycleConfirmDialog({
  action,
  agentName,
  status,
  typedName,
  onTypedNameChange,
  pending,
  errorMessage,
  onConfirm,
  onClose,
}: AgentLifecycleConfirmDialogProps) {
  const open = action !== null;
  const copy = action ? lifecycleConfirmCopy(action, agentName, status) : null;
  const canConfirm = action !== null && canConfirmLifecycleAction({ action, agentName, typedName, pending });

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !pending) onClose();
      }}
    >
      {copy && (
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{copy.title}</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="flex flex-col gap-2">
                {copy.paragraphs.map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>

          {copy.requiresTypedName && (
            <div className="flex flex-col gap-2">
              <Label htmlFor="lifecycle-confirm-name">
                Type <span className="font-mono">{agentName}</span> to confirm
              </Label>
              <Input
                id="lifecycle-confirm-name"
                value={typedName}
                onChange={(event) => onTypedNameChange(event.target.value)}
                autoComplete="off"
                spellCheck={false}
                disabled={pending}
                aria-describedby="lifecycle-confirm-name-hint"
              />
              <p id="lifecycle-confirm-name-hint" className="text-xs text-muted-foreground">
                The name must match exactly, including capitals and hyphens.
              </p>
            </div>
          )}

          {errorMessage && (
            <p role="alert" className="text-sm text-danger-text">
              {errorMessage}
            </p>
          )}

          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
            <Button
              variant={action === "revoke" ? "destructive" : "default"}
              disabled={!canConfirm}
              aria-busy={pending}
              onClick={onConfirm}
            >
              {pending ? copy.pendingLabel : copy.confirmLabel}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      )}
    </AlertDialog>
  );
}
