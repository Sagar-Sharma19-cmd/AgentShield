"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import {
  GRANTABLE_ACTIONS,
  HIGH_RISK_ACTION_COPY,
  grantableTools,
  highRiskActionsIn,
  isHighRiskAction,
  toggleAction,
  validatePermissionGrant,
  actionSummary,
} from "@/lib/agents/permission-grant";
import { ACTION_LABELS } from "@/lib/labels";
import { useGrantPermission } from "@/lib/queries/permissions";
import { useToolsList } from "@/lib/queries/tools";
import { TOOL_STATUS_LABELS } from "@/lib/tools/model";
import type { ActionType, PermissionResponse } from "@/types/api";

/** Starting values from the matrix ("Grant" on a row, or the re-grant after "Edit grant"). */
export interface GrantPrefill {
  toolId: string;
  actions: ActionType[];
  /** Changes on every request, so the parent can remount the form with these values. */
  nonce: number;
}

interface AgentGrantFormProps {
  agentId: string;
  agentName: string;
  existingGrants: PermissionResponse[];
  /** Initial values. The parent passes a new `key` with each prefill, so this is read once on mount. */
  prefill?: GrantPrefill | null;
}

const NO_TOOL = "";

type GrantValue = { toolId: string; allowedActions: ActionType[]; enabled: boolean };

/**
 * Grants one tool to an agent with a chosen set of actions. The backend allows one grant per agent and
 * tool, so tools that already have a grant are not offered. A disabled tool can still be granted: the
 * gateway denies it (TOOL_DISABLED) until the tool is enabled.
 *
 * A grant that includes DELETE, EXECUTE or EXTERNAL_REQUEST asks for a confirmation first, with one line on
 * the risk of each. The request is the same POST either way.
 */
export function AgentGrantForm({ agentId, agentName, existingGrants, prefill }: AgentGrantFormProps) {
  const tools = useToolsList();
  const grant = useGrantPermission(agentId);
  const [toolId, setToolId] = useState<string>(prefill?.toolId ?? NO_TOOL);
  const [actions, setActions] = useState<ActionType[]>(prefill?.actions ?? []);
  const [enabled, setEnabled] = useState(true);
  const [errors, setErrors] = useState<{ toolId?: string; actions?: string }>({});
  const [confirming, setConfirming] = useState<GrantValue | null>(null);
  const toolSelectId = useId();
  const enabledId = useId();
  const actionsLegendId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  // A prefill came from a matrix row: bring the form into view and focus the tool, so keyboard users land here.
  useEffect(() => {
    if (!prefill) return;
    formRef.current?.scrollIntoView({ block: "nearest" });
    triggerRef.current?.focus({ preventScroll: true });
  }, [prefill]);

  if (tools.isPending) {
    return <Skeleton className="h-32 w-full" aria-label="Loading tools" />;
  }
  if (tools.isError || !tools.data) {
    return (
      <p role="alert" className="text-sm text-danger-text">
        The tool registry could not be loaded. Refresh the page to try again.
      </p>
    );
  }

  const candidates = grantableTools(tools.data, existingGrants);
  const selectedTool = tools.data.find((tool) => tool.id === toolId);

  if (candidates.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Every registered tool already has a grant for {agentName}.{" "}
        <Link href="/tools" className="underline underline-offset-4">
          Register another tool
        </Link>{" "}
        to grant more.
      </p>
    );
  }

  function send(value: GrantValue) {
    grant.mutate(value, {
      onSuccess: () => {
        setToolId(NO_TOOL);
        setActions([]);
        setEnabled(true);
      },
      onSettled: () => setConfirming(null),
    });
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = validatePermissionGrant({ toolId, actions, enabled });
    setErrors(result.errors);
    if (!result.value) return;
    const value = { toolId: result.value.toolId, allowedActions: result.value.allowedActions, enabled: result.value.enabled };
    if (highRiskActionsIn(value.allowedActions).length > 0) setConfirming(value);
    else send(value);
  }

  const riskyInConfirm = confirming ? highRiskActionsIn(confirming.allowedActions) : [];
  const confirmToolName = confirming ? tools.data.find((tool) => tool.id === confirming.toolId)?.name ?? "this tool" : "";

  return (
    <>
      <form ref={formRef} onSubmit={submit} noValidate className="flex flex-col gap-4" aria-busy={grant.isPending}>
        <div className="flex flex-col gap-2">
          <Label htmlFor={toolSelectId}>Tool</Label>
          <Select value={toolId} onValueChange={(value) => setToolId(value ?? NO_TOOL)} disabled={grant.isPending}>
            <SelectTrigger ref={triggerRef} id={toolSelectId} aria-invalid={errors.toolId !== undefined} className="w-full">
              <SelectValue placeholder="Choose a tool" />
            </SelectTrigger>
            <SelectContent>
              {candidates.map((tool) => (
                <SelectItem key={tool.id} value={tool.id}>
                  <span className="font-mono text-xs">{tool.name}</span>
                  {tool.status !== "ACTIVE" && (
                    <span className="ml-2 text-xs text-muted-foreground">({TOOL_STATUS_LABELS[tool.status]})</span>
                  )}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {errors.toolId && (
            <p role="alert" className="text-sm text-danger-text">
              {errors.toolId}
            </p>
          )}
          {selectedTool?.status === "DISABLED" && (
            <p className="text-xs text-warning-text">
              {selectedTool.name} is disabled. The grant is stored, but requests to this tool are denied until it is
              enabled.
            </p>
          )}
        </div>

        <fieldset className="flex flex-col gap-2" aria-describedby={errors.actions ? `${actionsLegendId}-error` : undefined}>
          <legend id={actionsLegendId} className="mb-1 text-sm font-medium">
            Allowed actions
          </legend>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {GRANTABLE_ACTIONS.map((action) => {
              const checkId = `${actionsLegendId}-${action}`;
              const risky = isHighRiskAction(action);
              return (
                <div key={action} className="flex items-center gap-2.5 rounded-md border border-border bg-card px-3 py-2">
                  <Checkbox
                    id={checkId}
                    checked={actions.includes(action)}
                    disabled={grant.isPending}
                    onCheckedChange={() => setActions((current) => toggleAction(current, action))}
                  />
                  <Label htmlFor={checkId} className="flex flex-1 flex-wrap items-center gap-x-1.5 font-normal">
                    {ACTION_LABELS[action]}
                    <span className="font-mono text-[0.7rem] text-muted-foreground">{action}</span>
                    {risky && (
                      <span className="ml-auto inline-flex items-center gap-1 text-[0.6875rem] text-warning-text">
                        <ShieldAlert aria-hidden="true" className="size-3" />
                        Higher risk
                      </span>
                    )}
                  </Label>
                </div>
              );
            })}
          </div>
          {errors.actions && (
            <p id={`${actionsLegendId}-error`} role="alert" className="text-sm text-danger-text">
              {errors.actions}
            </p>
          )}
        </fieldset>

        <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-muted/40 px-3 py-2.5">
          <div className="flex flex-col">
            <Label htmlFor={enabledId}>Grant enabled</Label>
            <span className="text-xs text-muted-foreground">Turn off to store the grant without allowing access.</span>
          </div>
          <Switch id={enabledId} checked={enabled} onCheckedChange={setEnabled} disabled={grant.isPending} />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            {actions.length === 0 ? "No actions selected" : `Will allow: ${actionSummary(actions)}`}
          </p>
          <Button type="submit" disabled={grant.isPending}>
            {grant.isPending ? "Saving grant" : "Grant tool"}
          </Button>
        </div>
      </form>

        <AlertDialog open={confirming !== null} onOpenChange={(open) => !open && !grant.isPending && setConfirming(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                Grant {riskyInConfirm.map((action) => ACTION_LABELS[action]).join(", ")} on {confirmToolName}?
              </AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="flex flex-col gap-2">
                  <p>
                    {agentName} will be allowed {confirming ? actionSummary(confirming.allowedActions) : ""} on {confirmToolName}.
                    Policy, the Risk engine and trajectory analysis still check each request.
                  </p>
                  <ul className="flex flex-col gap-1.5">
                    {riskyInConfirm.map((action) => (
                      <li key={action} className="flex items-start gap-2">
                        <ShieldAlert aria-hidden="true" className="mt-0.5 size-3.5 shrink-0 text-warning-text" />
                        <span>{HIGH_RISK_ACTION_COPY[action]}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <Button variant="outline" onClick={() => setConfirming(null)} disabled={grant.isPending}>
                Cancel
              </Button>
              <Button onClick={() => confirming && send(confirming)} disabled={grant.isPending} aria-busy={grant.isPending}>
                {grant.isPending ? "Saving grant" : "Grant with these actions"}
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
    </>
  );
}
