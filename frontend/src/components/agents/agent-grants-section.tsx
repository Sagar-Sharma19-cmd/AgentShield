"use client";

import { AgentLoadError } from "@/components/agents/agent-load-error";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { describeAgentDetailError, describeAgentStatusEffect, sortGrantsForDisplay } from "@/lib/agents/detail-model";
import { formatTimestamp } from "@/lib/format";
import { ACTION_LABELS } from "@/lib/labels";
import type { AgentStatus, PermissionResponse } from "@/types/api";

interface AgentGrantsSectionProps {
  grants: PermissionResponse[] | undefined;
  isPending: boolean;
  isError: boolean;
  error: unknown;
  onRetry: () => void;
  /** Undefined while the agent itself has not loaded, so no status note can be given yet. */
  status: AgentStatus | undefined;
  /** When set, each grant shows a Revoke button. The caller owns the confirmation. */
  onRevoke?: (grant: PermissionResponse) => void;
}

function actionsText(actions: PermissionResponse["allowedActions"]): string {
  return actions.length === 0 ? "None" : actions.map((action) => ACTION_LABELS[action]).join(", ");
}

/** Enabled state is shown as text and an icon, never colour alone. */
function GrantFlag({ enabled }: { enabled: boolean }) {
  return <span className="text-sm">{enabled ? "Enabled" : "Disabled"}</span>;
}

/**
 * Read-only grants for one agent. Its own states are independent of the agent summary: a failed
 * grants request leaves the agent details visible.
 */
export function AgentGrantsSection({
  grants,
  isPending,
  isError,
  error,
  onRetry,
  status,
  onRevoke,
}: AgentGrantsSectionProps) {
  const effect = status ? describeAgentStatusEffect(status) : undefined;

  return (
    <section aria-labelledby="agent-grants-heading" className="flex flex-col gap-3">
      <h3 id="agent-grants-heading" className="text-sm font-medium">
        Permission grants
      </h3>
      <p className="text-xs text-muted-foreground">
        The Grant column shows the grant&apos;s own flag. It does not show whether the tool itself is enabled.
      </p>
      {effect?.grantsNote && (
        <p role="status" className="rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-warning-text">
          {effect.grantsNote}
        </p>
      )}

      {isPending ? (
        <div className="flex flex-col gap-2" aria-busy="true" aria-label="Loading permission grants">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : isError ? (
        <AgentLoadError copy={describeAgentDetailError(error, "grants")} onRetry={onRetry} />
      ) : !grants || grants.length === 0 ? (
        <div className="rounded-lg border border-dashed bg-muted/40 px-4 py-6 text-center">
          <p className="text-sm font-medium">No permission grants are assigned to this agent.</p>
          <p className="mt-1 text-xs text-muted-foreground">
            The gateway denies this agent&apos;s requests to any tool it has no grant for.
          </p>
        </div>
      ) : (
        <GrantsList grants={sortGrantsForDisplay(grants)} onRevoke={onRevoke} />
      )}
    </section>
  );
}

function GrantsList({
  grants,
  onRevoke,
}: {
  grants: PermissionResponse[];
  onRevoke?: (grant: PermissionResponse) => void;
}) {
  return (
    <>
      <div className="hidden sm:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Tool</TableHead>
              <TableHead>Allowed actions</TableHead>
              <TableHead>Grant</TableHead>
              <TableHead>Updated</TableHead>
              {onRevoke && (
                <TableHead>
                  <span className="sr-only">Actions</span>
                </TableHead>
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {grants.map((grant) => (
              <TableRow key={grant.id}>
                <TableCell className="font-mono text-xs">{grant.toolName}</TableCell>
                <TableCell className="text-sm">{actionsText(grant.allowedActions)}</TableCell>
                <TableCell>
                  <GrantFlag enabled={grant.enabled} />
                </TableCell>
                <TableCell>
                  <time dateTime={grant.updatedAt} className="font-mono text-xs tabular-nums text-muted-foreground">
                    {formatTimestamp(grant.updatedAt)}
                  </time>
                </TableCell>
                {onRevoke && (
                  <TableCell className="text-right">
                    <Button variant="outline" size="sm" onClick={() => onRevoke(grant)}>
                      Revoke<span className="sr-only"> grant for {grant.toolName}</span>
                    </Button>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <ul className="flex flex-col gap-2 sm:hidden" aria-label="Permission grants">
        {grants.map((grant) => (
          <li key={grant.id} className="flex flex-col gap-1.5 rounded-lg border bg-card p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="min-w-0 truncate font-mono text-xs">{grant.toolName}</span>
              <GrantFlag enabled={grant.enabled} />
            </div>
            <p className="text-sm">{actionsText(grant.allowedActions)}</p>
            <div className="flex items-center justify-between gap-2">
              <time dateTime={grant.updatedAt} className="font-mono text-xs tabular-nums text-muted-foreground">
                Updated {formatTimestamp(grant.updatedAt)}
              </time>
              {onRevoke && (
                <Button variant="outline" size="sm" onClick={() => onRevoke(grant)}>
                  Revoke<span className="sr-only"> grant for {grant.toolName}</span>
                </Button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
