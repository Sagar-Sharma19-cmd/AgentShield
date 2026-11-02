"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { OneTimeKeyDialog } from "@/components/agents/one-time-key-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  DESCRIPTION_MAX_LENGTH,
  mapServerFieldErrors,
  validateAgentRegistration,
  type FieldErrors,
} from "@/lib/agents/registration";
import { useRegisterAgent, type IssuedRegistrationKey } from "@/lib/queries/agent-registration";

/**
 * Registers an agent and shows its API key once. The key lives only in this component's state and is
 * dropped when the operator acknowledges it or chooses to discard it.
 */
export function RegisterAgentFlow() {
  const [formOpen, setFormOpen] = useState(false);
  const [issued, setIssued] = useState<IssuedRegistrationKey | null>(null);
  const [leaveConfirmOpen, setLeaveConfirmOpen] = useState(false);

  function clearIssuedKey() {
    setIssued(null);
    setLeaveConfirmOpen(false);
  }

  return (
    <>
      <Button size="sm" onClick={() => setFormOpen(true)}>
        <Plus aria-hidden="true" />
        Register agent
      </Button>

      {formOpen && (
        <RegisterAgentForm
          onClose={() => setFormOpen(false)}
          onKeyIssued={(next) => {
            setIssued(next);
            setLeaveConfirmOpen(false);
          }}
        />
      )}

      {issued && (
        <OneTimeKeyDialog
          mode="register"
          agentName={issued.agentName}
          apiKey={issued.apiKey}
          leaveConfirmOpen={leaveConfirmOpen}
          onAcknowledge={clearIssuedKey}
          onLeaveAttempt={() => setLeaveConfirmOpen(true)}
          onStayOnKey={() => setLeaveConfirmOpen(false)}
          onDiscardKey={clearIssuedKey}
        />
      )}
    </>
  );
}

const FORM_FIELDS = ["name", "description"] as const;

function RegisterAgentForm({
  onClose,
  onKeyIssued,
}: {
  onClose: () => void;
  onKeyIssued: (issued: IssuedRegistrationKey) => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [errors, setErrors] = useState<FieldErrors<"name" | "description">>({});
  const register = useRegisterAgent(onKeyIssued);

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = validateAgentRegistration({ name, description });
    setErrors(result.errors);
    if (!result.value) return;

    register.mutate(result.value, {
      onSuccess: () => onClose(),
      onError: (error) => setErrors(mapServerFieldErrors(error, FORM_FIELDS)),
    });
  }

  const pending = register.isPending;

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !pending) onClose();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Register an agent</DialogTitle>
          <DialogDescription>
            Creates an ACTIVE agent identity and returns its API key. The key is shown once, on the next screen.
            Grant the agent tool permissions afterwards.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} noValidate className="flex flex-col gap-4" aria-busy={pending}>
          <div className="flex flex-col gap-2">
            <Label htmlFor="agent-name">Name</Label>
            <Input
              id="agent-name"
              autoComplete="off"
              spellCheck={false}
              placeholder="ci-deployer"
              value={name}
              disabled={pending}
              aria-invalid={errors.name !== undefined}
              aria-describedby={errors.name ? "agent-name-error" : "agent-name-hint"}
              onChange={(event) => setName(event.target.value)}
              className="font-mono"
            />
            {errors.name ? (
              <p id="agent-name-error" role="alert" className="text-sm text-danger-text">
                {errors.name}
              </p>
            ) : (
              <p id="agent-name-hint" className="text-xs text-muted-foreground">
                Lowercase letters, digits, &apos;.&apos;, &apos;_&apos; and &apos;-&apos;. This name is what the gateway
                receives as agentId.
              </p>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="agent-description">Description (optional)</Label>
            <Textarea
              id="agent-description"
              rows={3}
              value={description}
              disabled={pending}
              aria-invalid={errors.description !== undefined}
              aria-describedby={errors.description ? "agent-description-error" : "agent-description-hint"}
              onChange={(event) => setDescription(event.target.value)}
            />
            {errors.description ? (
              <p id="agent-description-error" role="alert" className="text-sm text-danger-text">
                {errors.description}
              </p>
            ) : (
              <p id="agent-description-hint" className="text-xs text-muted-foreground">
                Up to {DESCRIPTION_MAX_LENGTH} characters. Shown to operators only.
              </p>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Registering" : "Register agent"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
