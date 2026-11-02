"use client";

import { useState } from "react";
import type { UseQueryResult } from "@tanstack/react-query";
import Link from "next/link";
import { AgentGrantForm } from "@/components/agents/agent-grant-form";
import { AgentGrantsSection } from "@/components/agents/agent-grants-section";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { useRevokePermission } from "@/lib/queries/permissions";
import type { AgentStatus, PermissionResponse } from "@/types/api";

interface AgentPermissionsPanelProps {
  agentId: string;
  agentName: string;
  status: AgentStatus | undefined;
  grants: UseQueryResult<PermissionResponse[]>;
}

/**
 * Permission management for one agent: the current grants (with revoke) and the form that grants a new
 * tool. Revocation asks first, because the agent loses access as soon as the grant is removed.
 */
export function AgentPermissionsPanel({ agentId, agentName, status, grants }: AgentPermissionsPanelProps) {
  const [revokeTarget, setRevokeTarget] = useState<PermissionResponse | null>(null);
  const revoke = useRevokePermission(agentId);

  function confirmRevoke() {
    if (!revokeTarget) return;
    revoke.mutate(revokeTarget.id, { onSettled: () => setRevokeTarget(null) });
  }

  return (
    <>
      <AgentGrantsSection
        grants={grants.data}
        isPending={grants.isPending}
        isError={grants.isError}
        error={grants.error}
        onRetry={() => void grants.refetch()}
        status={status}
        onRevoke={status === "REVOKED" ? undefined : setRevokeTarget}
      />

      {status !== "REVOKED" && (
        <section aria-labelledby="grant-form-heading" className="flex flex-col gap-3 border-t pt-5">
          <h3 id="grant-form-heading" className="text-sm font-medium">
            Grant a tool
          </h3>
          <AgentGrantForm agentId={agentId} agentName={agentName} existingGrants={grants.data ?? []} />
        </section>
      )}

      {status === "REVOKED" && (
        <p className="text-xs text-muted-foreground">
          A revoked agent cannot receive new grants, and its grants are read-only.{" "}
          <Link href="/tools" className="underline underline-offset-4">
            Review the tool registry
          </Link>
          .
        </p>
      )}

      <AlertDialog open={revokeTarget !== null} onOpenChange={(open) => !open && !revoke.isPending && setRevokeTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke {revokeTarget?.toolName} from {agentName}?</AlertDialogTitle>
            <AlertDialogDescription>
              {agentName} will be denied this tool (UNAUTHORIZED) as soon as the grant is removed. You can grant it
              again later, and the new grant will start with the actions you select then.
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
    </>
  );
}
