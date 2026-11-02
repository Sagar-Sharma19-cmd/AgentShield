"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { DESCRIPTION_MAX_LENGTH, mapServerFieldErrors, type FieldErrors } from "@/lib/agents/registration";
import { useRegisterTool } from "@/lib/queries/tools";
import { TOOL_TYPE_LABELS, TOOL_TYPES, validateToolRegistration } from "@/lib/tools/model";
import type { ToolType } from "@/types/api";

const FORM_FIELDS = ["name", "description", "toolType"] as const;

/** Registers a tool. A new tool is ACTIVE, but no agent can use it until a grant is made. */
export function RegisterToolButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <Plus aria-hidden="true" />
        Register tool
      </Button>
      {open && <RegisterToolDialog onClose={() => setOpen(false)} />}
    </>
  );
}

function RegisterToolDialog({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [toolType, setToolType] = useState<ToolType | "">("");
  const [errors, setErrors] = useState<FieldErrors<(typeof FORM_FIELDS)[number]>>({});
  const register = useRegisterTool();
  const pending = register.isPending;

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = validateToolRegistration({ name, description, toolType });
    setErrors(result.errors);
    if (!result.value) return;

    register.mutate(result.value, {
      onSuccess: () => onClose(),
      onError: (error) => setErrors(mapServerFieldErrors(error, FORM_FIELDS)),
    });
  }

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next && !pending) onClose();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Register a tool</DialogTitle>
          <DialogDescription>
            A tool is a system an agent can call through the gateway, such as a build server or a registry. Grant
            agents access to it separately.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} noValidate className="flex flex-col gap-4" aria-busy={pending}>
          <div className="flex flex-col gap-2">
            <Label htmlFor="tool-name">Name</Label>
            <Input
              id="tool-name"
              autoComplete="off"
              spellCheck={false}
              placeholder="jenkins"
              value={name}
              disabled={pending}
              aria-invalid={errors.name !== undefined}
              aria-describedby={errors.name ? "tool-name-error" : undefined}
              onChange={(event) => setName(event.target.value)}
              className="font-mono"
            />
            {errors.name && (
              <p id="tool-name-error" role="alert" className="text-sm text-danger-text">
                {errors.name}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="tool-type">Tool type</Label>
            <Select value={toolType} onValueChange={(value) => setToolType((value as ToolType) ?? "")} disabled={pending}>
              <SelectTrigger id="tool-type" aria-invalid={errors.toolType !== undefined} className="w-full">
                <SelectValue placeholder="Choose a type" />
              </SelectTrigger>
              <SelectContent>
                {TOOL_TYPES.map((type) => (
                  <SelectItem key={type} value={type}>
                    {TOOL_TYPE_LABELS[type]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.toolType && (
              <p role="alert" className="text-sm text-danger-text">
                {errors.toolType}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="tool-description">Description (optional)</Label>
            <Textarea
              id="tool-description"
              rows={3}
              value={description}
              disabled={pending}
              aria-invalid={errors.description !== undefined}
              aria-describedby={errors.description ? "tool-description-error" : undefined}
              onChange={(event) => setDescription(event.target.value)}
            />
            {errors.description ? (
              <p id="tool-description-error" role="alert" className="text-sm text-danger-text">
                {errors.description}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">Up to {DESCRIPTION_MAX_LENGTH} characters.</p>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Registering" : "Register tool"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
