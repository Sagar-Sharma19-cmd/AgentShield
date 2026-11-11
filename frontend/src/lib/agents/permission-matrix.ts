/**
 * Permission matrix for one agent: rows are tools, columns are the grantable actions. Pure; tested in
 * permission-matrix.test.ts.
 *
 * It is a read view of the agent's grants. The backend has no endpoint that changes a grant's actions in
 * place (only POST /permissions and DELETE /permissions/{id}), so the matrix never edits a cell. Changing a
 * grant means revoking it and granting the tool again, through the existing grant and revoke flows.
 *
 * "In effect" mirrors what the PermissionEngine checks, in order: the agent is ACTIVE, the tool is ACTIVE
 * (TOOL_DISABLED), the grant is enabled (PERMISSION_DISABLED) and the action is in allowedActions
 * (UNAUTHORIZED). It reads recorded fields only.
 */
import { ACTION_LABELS } from "@/lib/labels";
import { GRANTABLE_ACTIONS } from "@/lib/agents/permission-grant";
import type { ActionType, AgentStatus, PermissionResponse, ToolResponse, ToolStatus, ToolType } from "@/types/api";

export const MATRIX_ACTIONS = GRANTABLE_ACTIONS;

/** Why granted actions of a row are not usable right now, first failing check first. Null when they are. */
export type RowBlock = "AGENT_SUSPENDED" | "AGENT_REVOKED" | "TOOL_DISABLED" | "GRANT_DISABLED" | null;

export const ROW_BLOCK_LABELS: Record<Exclude<RowBlock, null>, string> = {
  AGENT_SUSPENDED: "agent suspended",
  AGENT_REVOKED: "agent revoked",
  TOOL_DISABLED: "tool disabled",
  GRANT_DISABLED: "grant disabled",
};

export type CellState = "granted" | "granted-blocked" | "not-granted";

export interface MatrixRow {
  toolId: string;
  toolName: string;
  /** Unknown when the grant names a tool that is not in the loaded tool list. */
  toolType: ToolType | null;
  toolStatus: ToolStatus | null;
  grant: PermissionResponse | null;
  block: RowBlock;
  cells: Record<ActionType, CellState>;
}

function compareText(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

function rowBlock(agentStatus: AgentStatus | undefined, toolStatus: ToolStatus | null, grant: PermissionResponse): RowBlock {
  if (agentStatus === "REVOKED") return "AGENT_REVOKED";
  if (agentStatus === "SUSPENDED") return "AGENT_SUSPENDED";
  if (toolStatus === "DISABLED") return "TOOL_DISABLED";
  if (!grant.enabled) return "GRANT_DISABLED";
  return null;
}

/**
 * One row per registered tool, plus a row for any grant whose tool is not in `tools` (so a grant is never
 * hidden when the tool list is stale or failed to load; pass [] then). Sorted by tool name, then id.
 * `agentStatus` undefined (agent still loading) does not block a row.
 */
export function buildPermissionMatrix(
  tools: readonly Pick<ToolResponse, "id" | "name" | "toolType" | "status">[],
  grants: readonly PermissionResponse[],
  agentStatus: AgentStatus | undefined,
): MatrixRow[] {
  const grantByTool = new Map(grants.map((grant) => [grant.toolId, grant]));
  const rows: MatrixRow[] = [];
  const seen = new Set<string>();

  const push = (toolId: string, toolName: string, toolType: ToolType | null, toolStatus: ToolStatus | null) => {
    const grant = grantByTool.get(toolId) ?? null;
    const block = grant ? rowBlock(agentStatus, toolStatus, grant) : null;
    const cells = Object.fromEntries(
      MATRIX_ACTIONS.map((action) => {
        const granted = grant?.allowedActions.includes(action) ?? false;
        return [action, granted ? (block ? "granted-blocked" : "granted") : "not-granted"];
      }),
    ) as Record<ActionType, CellState>;
    rows.push({ toolId, toolName, toolType, toolStatus, grant, block, cells });
    seen.add(toolId);
  };

  for (const tool of tools) push(tool.id, tool.name, tool.toolType, tool.status);
  for (const grant of grants) if (!seen.has(grant.toolId)) push(grant.toolId, grant.toolName, null, null);

  return rows.sort((a, b) => compareText(a.toolName, b.toolName) || compareText(a.toolId, b.toolId));
}

/** Screen-reader text for one cell, e.g. "Delete: granted, not in effect (tool disabled)". */
export function cellLabel(action: ActionType, state: CellState, block: RowBlock): string {
  const name = ACTION_LABELS[action];
  if (state === "not-granted") return `${name}: not granted`;
  if (state === "granted-blocked" && block) return `${name}: granted, not in effect (${ROW_BLOCK_LABELS[block]})`;
  return `${name}: granted`;
}

export interface MatrixSummary {
  tools: number;
  grantedTools: number;
  /** Granted (tool, action) pairs, whether in effect or not. */
  grantedActions: number;
  /** Granted pairs that the gateway would currently let through the Permission gate. */
  effectiveActions: number;
}

export function summarizeMatrix(rows: readonly MatrixRow[]): MatrixSummary {
  let grantedActions = 0;
  let effectiveActions = 0;
  for (const row of rows) {
    for (const action of MATRIX_ACTIONS) {
      if (row.cells[action] !== "not-granted") grantedActions += 1;
      if (row.cells[action] === "granted") effectiveActions += 1;
    }
  }
  return {
    tools: rows.length,
    grantedTools: rows.filter((row) => row.grant !== null).length,
    grantedActions,
    effectiveActions,
  };
}
