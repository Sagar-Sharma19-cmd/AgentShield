"use client";

import { useState } from "react";
import { EYEBROW_CLASS as EYEBROW } from "@/components/shell/page-header";
import type { UseQueryResult } from "@tanstack/react-query";
import Link from "next/link";
import { AgentGrantForm, type GrantPrefill } from "@/components/agents/agent-grant-form";
import { AgentLoadError } from "@/components/agents/agent-load-error";
import { AgentPermissionMatrix } from "@/components/agents/agent-permission-matrix";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { describeAgentDetailError, describeAgentStatusEffect } from "@/lib/agents/detail-model";
import { actionSummary } from "@/lib/agents/permission-grant";
import { buildPermissionMatrix, summarizeMatrix, type MatrixRow } from "@/lib/agents/permission-matrix";
import { useRevokePermission } from "@/lib/queries/permissions";
import { useToolsList } from "@/lib/queries/tools";
import type { AgentStatus, PermissionResponse } from "@/types/api";


interface AgentPermissionsPanelProps {
  agentId: string;
  agentName: string;
  status: AgentStatus | undefined;
  grants: UseQueryResult<PermissionResponse[]>;
}

/**
 * Permissions for one agent: the matrix (read view), the existing revoke confirmation and the existing grant
 * form. The API has no way to change a grant's actions in place (POST and DELETE only), so "Edit grant" explains
 * that and offers the revoke; after a revoke started there, the grant form is pre-filled with the same tool and
 * actions so the operator can adjust them and grant again. Nothing is granted or revoked without its own button.
 */
export function AgentPermissionsPanel({ agentId, agentName, status, grants }: AgentPermissionsPanelProps) {
  const tools = useToolsList();
  const revoke = useRevokePermission(agentId);
  const [editTarget, setEditTarget] = useState<PermissionResponse | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<{ grant: PermissionResponse; fromEdit: boolean } | null>(null);
  const [prefill, setPrefill] = useState<GrantPrefill | null>(null);

  const revoked = status === "REVOKED";
  const effect = status ? describeAgentStatusEffect(status) : undefined;
  const rows = grants.data ? buildPermissionMatrix(tools.data ?? [], grants.data, status) : undefined;
  const summary = rows ? summarizeMatrix(rows) : undefined;

  function confirmRevoke() {
    if (!revokeTarget) return;
    const { grant, fromEdit } = revokeTarget;
    revoke.mutate(grant.id, {
      onSuccess: () => {
        if (fromEdit) setPrefill({ toolId: grant.toolId, actions: [...grant.allowedActions], nonce: Date.now() });
      },
      onSettled: () => setRevokeTarget(null),
    });
  }

  function grantTool(row: MatrixRow) {
    setPrefill({ toolId: row.toolId, actions: [], nonce: Date.now() });
  }

  return (
    <section aria-labelledby="agent-permissions-heading" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 id="agent-permissions-heading" className={EYEBROW}>
          Permissions
        </h3>
        {summary && (
          <p className="font-mono text-xs tabular-nums text-muted-foreground">
            {summary.grantedTools} of {summary.tools} tools granted · {summary.effectiveActions} of {summary.grantedActions}{" "}
            actions in effect
          </p>
        )}
      </div>

      {effect?.grantsNote && (
        <p role="status" className="rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-warning-text">
          {effect.grantsNote}
        </p>
      )}

      {grants.isPending ? (
        <div className="flex flex-col gap-2" aria-busy="true" aria-label="Loading permission grants">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : grants.isError || !rows ? (
        <AgentLoadError copy={describeAgentDetailError(grants.error, "grants")} onRetry={() => void grants.refetch()} />
      ) : rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border px-4 py-5">
          <p className="text-sm font-medium">No tools are registered, and this agent has no grants.</p>
          <p className="mt-1 text-xs text-muted-foreground">
            The gateway denies every request from this agent at the Permission gate.{" "}
            <Link href="/tools" className="underline underline-offset-4">
              Register a tool
            </Link>{" "}
            first.
          </p>
        </div>
      ) : (
        <>
          {summary?.grantedTools === 0 && (
            <p className="text-xs text-muted-foreground">
              No grants yet. The gateway denies this agent&apos;s requests to every tool (UNAUTHORIZED) until one is granted.
            </p>
          )}
          {tools.isError && (
            <p role="status" className="text-xs text-muted-foreground">
              The tool list could not be loaded, so only tools this agent has a grant for are shown.
            </p>
          )}
          <AgentPermissionMatrix
            rows={rows}
            agentName={agentName}
            onEditGrant={revoked ? undefined : (row) => row.grant && setEditTarget(row.grant)}
            onRevokeGrant={revoked ? undefined : (row) => row.grant && setRevokeTarget({ grant: row.grant, fromEdit: false })}
            onGrantTool={revoked ? undefined : grantTool}
          />
          <p className="text-xs text-muted-foreground">
            A check means the action is granted. A dashed box means it is granted but not in effect, for the reason on the
            row. The Permission gate also checks that the agent and the tool are active.
          </p>
        </>
      )}

      {!revoked && (
        <section aria-labelledby="grant-form-heading" className="flex flex-col gap-3 border-t border-dashed border-border pt-4">
          <h4 id="grant-form-heading" className={EYEBROW}>
            Grant a tool
          </h4>
          <AgentGrantForm
            key={prefill?.nonce ?? "empty"}
            agentId={agentId}
            agentName={agentName}
            existingGrants={grants.data ?? []}
            prefill={prefill}
          />
        </section>
      )}

      {revoked && (
        <p className="text-xs text-muted-foreground">
          A revoked agent cannot receive new grants, and its grants are read-only.{" "}
          <Link href="/tools" className="underline underline-offset-4">
            Review the tool registry
          </Link>
          .
        </p>
      )}

      <AlertDialog open={editTarget !== null} onOpenChange={(open) => !open && setEditTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Change the {editTarget?.toolName} grant?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="flex flex-col gap-2">
                <p>
                  AgentShield cannot change a grant&apos;s actions in place. To change them, revoke this grant, then grant{" "}
                  {editTarget?.toolName} again. The grant form is filled in with the current actions so you can adjust them.
                </p>
                <p>
                  Current actions: <span className="font-medium text-foreground">{editTarget && actionSummary(editTarget.allowedActions)}</span>.
                  Between the two steps {agentName} is denied this tool (UNAUTHORIZED).
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button variant="outline" onClick={() => setEditTarget(null)}>
              Keep the grant
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (!editTarget) return;
                setRevokeTarget({ grant: editTarget, fromEdit: true });
                setEditTarget(null);
              }}
            >
              Revoke to change it
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={revokeTarget !== null} onOpenChange={(open) => !open && !revoke.isPending && setRevokeTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Revoke {revokeTarget?.grant.toolName} from {agentName}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {agentName} will be denied this tool (UNAUTHORIZED) as soon as the grant is removed. You can grant it again
              later, and the new grant will start with the actions you select then.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button variant="outline" onClick={() => setRevokeTarget(null)} disabled={revoke.isPending}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmRevoke} disabled={revoke.isPending}>
              {revoke.isPending ? "Revoking" : "Revoke grant"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
