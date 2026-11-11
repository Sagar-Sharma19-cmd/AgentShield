"use client";

import { Check, Minus, ShieldAlert } from "lucide-react";
import { ToolStatusBadge } from "@/components/tools/tool-status-badge";
import { ToolTypeIcon } from "@/components/tools/tool-type-icon";
import { Button } from "@/components/ui/button";
import { isHighRiskAction } from "@/lib/agents/permission-grant";
import { MATRIX_ACTIONS, ROW_BLOCK_LABELS, cellLabel, type CellState, type MatrixRow } from "@/lib/agents/permission-matrix";
import { formatTimestamp } from "@/lib/format";
import { ACTION_LABELS } from "@/lib/labels";
import { cn } from "@/lib/utils";
import type { ActionType } from "@/types/api";

/** Short column headings. The full action name is in each cell's screen-reader text. */
const SHORT_ACTION_LABELS: Record<ActionType, string> = {
  READ: "Read",
  WRITE: "Write",
  DELETE: "Delete",
  EXECUTE: "Execute",
  EXTERNAL_REQUEST: "External",
};

interface AgentPermissionMatrixProps {
  rows: MatrixRow[];
  agentName: string;
  /** Undefined for a revoked agent: its grants are read-only and nothing can be granted. */
  onEditGrant?: (row: MatrixRow) => void;
  onRevokeGrant?: (row: MatrixRow) => void;
  onGrantTool?: (row: MatrixRow) => void;
}

/**
 * Read view of an agent's grants: tools by actions. A cell is never coloured alone: granted is a check in a
 * solid box, granted-but-not-in-effect is a check in a dashed box with the reason written on the row, and not
 * granted is a dash. Every cell also has its full meaning as screen-reader text.
 */
export function AgentPermissionMatrix({ rows, agentName, onEditGrant, onRevokeGrant, onGrantTool }: AgentPermissionMatrixProps) {
  const editable = onEditGrant !== undefined || onRevokeGrant !== undefined || onGrantTool !== undefined;
  const handlers = { onEditGrant, onRevokeGrant, onGrantTool };
  return (
    <>
      <div className="hidden overflow-x-auto rounded-lg border border-border sm:block">
        <table className="w-full text-sm">
          <caption className="sr-only">
            Permission matrix for {agentName}: registered tools by action. Each cell says whether the action is granted.
          </caption>
          <thead>
            <tr className="border-b border-border bg-muted/40">
              <th scope="col" className="px-3 py-2 text-left font-mono text-[0.6875rem] font-normal tracking-[0.08em] text-muted-foreground uppercase">
                Tool
              </th>
              {MATRIX_ACTIONS.map((action) => (
                <th
                  key={action}
                  scope="col"
                  className="px-1.5 py-2 text-center font-mono text-[0.6875rem] font-normal tracking-[0.04em] text-muted-foreground uppercase"
                >
                  <span className="inline-flex items-center gap-1">
                    {isHighRiskAction(action) && <ShieldAlert aria-hidden="true" className="size-3 text-warning-text" />}
                    {SHORT_ACTION_LABELS[action]}
                    {isHighRiskAction(action) && <span className="sr-only"> (higher risk)</span>}
                  </span>
                </th>
              ))}
              {editable && (
                <th scope="col" className="px-3 py-2">
                  <span className="sr-only">Grant actions</span>
                </th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((row) => (
              <tr key={row.toolId} className={row.grant ? undefined : "text-muted-foreground"}>
                <th scope="row" className="px-3 py-2 text-left font-normal">
                  <RowIdentity row={row} />
                </th>
                {MATRIX_ACTIONS.map((action) => (
                  <td key={action} className="px-1.5 py-2 text-center">
                    <MatrixCell action={action} state={row.cells[action]} row={row} />
                  </td>
                ))}
                {editable && (
                  <td className="px-3 py-2 text-right">
                    <RowAction row={row} {...handlers} />
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul aria-label={`Permission matrix for ${agentName}`} className="flex flex-col divide-y divide-border rounded-lg border border-border sm:hidden">
        {rows.map((row) => (
          <li key={row.toolId} className="flex flex-col gap-2 px-3 py-2.5">
            <div className="flex items-start justify-between gap-2">
              <RowIdentity row={row} />
              {editable && <RowAction row={row} {...handlers} />}
            </div>
            <ul className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs" aria-label={`Actions for ${row.toolName}`}>
              {MATRIX_ACTIONS.map((action) => (
                <li key={action} className="flex items-center gap-1.5">
                  <MatrixCell action={action} state={row.cells[action]} row={row} />
                  <span aria-hidden="true" className={row.cells[action] === "not-granted" ? "text-muted-foreground" : undefined}>
                    {ACTION_LABELS[action]}
                  </span>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </>
  );
}

function RowIdentity({ row }: { row: MatrixRow }) {
  return (
    <span className="flex min-w-0 items-start gap-2.5">
      <ToolTypeIcon type={row.toolType} className="size-7" />
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="flex flex-wrap items-center gap-1.5">
          <span className="truncate font-mono text-xs font-medium text-foreground">{row.toolName}</span>
          {row.toolStatus === "DISABLED" && <ToolStatusBadge status="DISABLED" className="h-5 px-1.5 text-[0.6875rem]" />}
        </span>
        <span className="text-[0.6875rem] text-muted-foreground">
          {row.grant === null ? (
            "No grant"
          ) : (
            <>
              {row.block ? `Not in effect: ${ROW_BLOCK_LABELS[row.block]}` : "Grant enabled"}
              {" · "}
              <time dateTime={row.grant.updatedAt} className="font-mono tabular-nums">
                {formatTimestamp(row.grant.updatedAt)}
              </time>
            </>
          )}
        </span>
      </span>
    </span>
  );
}

function MatrixCell({ action, state, row }: { action: ActionType; state: CellState; row: MatrixRow }) {
  const label = cellLabel(action, state, row.block);
  if (state === "not-granted") {
    return (
      <span className="inline-flex size-6 items-center justify-center text-muted-foreground/70" title={label}>
        <Minus aria-hidden="true" className="size-3.5" />
        <span className="sr-only">{label}</span>
      </span>
    );
  }
  return (
    <span
      title={label}
      className={cn(
        "inline-flex size-6 items-center justify-center rounded-md border",
        state === "granted"
          ? "border-success/40 bg-success/10 text-success-text"
          : "border-dashed border-muted-foreground/60 text-muted-foreground",
      )}
    >
      <Check aria-hidden="true" className="size-3.5" />
      <span className="sr-only">{label}</span>
    </span>
  );
}

function RowAction({
  row,
  onEditGrant,
  onRevokeGrant,
  onGrantTool,
}: {
  row: MatrixRow;
  onEditGrant?: (row: MatrixRow) => void;
  onRevokeGrant?: (row: MatrixRow) => void;
  onGrantTool?: (row: MatrixRow) => void;
}) {
  if (row.grant) {
    return (
      <span className="inline-flex flex-wrap justify-end gap-1.5">
        {onEditGrant && (
          <Button variant="outline" size="sm" onClick={() => onEditGrant(row)}>
            Edit grant<span className="sr-only"> for {row.toolName}</span>
          </Button>
        )}
        {onRevokeGrant && (
          <Button variant="ghost" size="sm" className="text-danger-text hover:text-danger-text" onClick={() => onRevokeGrant(row)}>
            Revoke<span className="sr-only"> grant for {row.toolName}</span>
          </Button>
        )}
      </span>
    );
  }
  if (!row.grant && onGrantTool) {
    return (
      <Button variant="ghost" size="sm" onClick={() => onGrantTool(row)}>
        Grant<span className="sr-only"> {row.toolName}</span>
      </Button>
    );
  }
  return null;
}
