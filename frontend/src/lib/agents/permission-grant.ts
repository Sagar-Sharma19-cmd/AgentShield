import { ApiError } from "@/lib/api/client";
import { ACTION_LABELS } from "@/lib/labels";
import type { ActionType, PermissionResponse, ToolResponse } from "@/types/api";
import type { FieldErrors } from "@/lib/agents/registration";

/** Grantable actions, in the order the backend enum declares them. */
export const GRANTABLE_ACTIONS = ["READ", "WRITE", "DELETE", "EXECUTE", "EXTERNAL_REQUEST"] as const satisfies readonly ActionType[];

/** Actions whose grant asks for an extra confirmation, because their effect is destructive or leaves the system. */
export const HIGH_RISK_ACTIONS = ["DELETE", "EXECUTE", "EXTERNAL_REQUEST"] as const satisfies readonly ActionType[];
export type HighRiskAction = (typeof HIGH_RISK_ACTIONS)[number];

/** One line per high-risk action, shown in the grant confirmation. */
export const HIGH_RISK_ACTION_COPY: Record<HighRiskAction, string> = {
  DELETE: "Delete lets the agent remove data through this tool, and the gateway cannot undo a deletion it allowed.",
  EXECUTE: "Execute lets the agent run commands or jobs through this tool.",
  EXTERNAL_REQUEST: "External request lets the agent send data to systems outside your network through this tool.",
};

export function isHighRiskAction(action: ActionType): action is HighRiskAction {
  return (HIGH_RISK_ACTIONS as readonly ActionType[]).includes(action);
}

/** The high-risk actions in a selection, in canonical order, without duplicates. */
export function highRiskActionsIn(actions: readonly ActionType[]): HighRiskAction[] {
  return HIGH_RISK_ACTIONS.filter((action) => actions.includes(action));
}

export interface PermissionGrantInput {
  toolId: string;
  actions: ActionType[];
  enabled: boolean;
}

/** Tools an agent can still be granted. The backend rejects a second grant for the same pair (409). */
export function grantableTools(tools: readonly ToolResponse[], grants: readonly PermissionResponse[]): ToolResponse[] {
  const granted = new Set(grants.map((grant) => grant.toolId));
  return tools.filter((tool) => !granted.has(tool.id));
}

export function validatePermissionGrant(
  input: PermissionGrantInput,
): { value: { toolId: string; allowedActions: ActionType[]; enabled: boolean } | null; errors: FieldErrors<"toolId" | "actions"> } {
  const errors: FieldErrors<"toolId" | "actions"> = {};
  if (input.toolId === "") errors.toolId = "Choose a tool.";
  if (input.actions.length === 0) errors.actions = "Select at least one action.";
  if (Object.keys(errors).length > 0) return { value: null, errors };

  // Keep the backend's canonical action order, and drop duplicates.
  const allowedActions = GRANTABLE_ACTIONS.filter((action) => input.actions.includes(action));
  return { value: { toolId: input.toolId, allowedActions, enabled: input.enabled }, errors };
}

export function toggleAction(actions: readonly ActionType[], action: ActionType): ActionType[] {
  return actions.includes(action) ? actions.filter((item) => item !== action) : [...actions, action];
}

export function describeGrantError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 401 || error.status === 403) {
      return "AgentShield rejected the admin key. Lock the console and unlock it again.";
    }
    if (error.status === 409) return "This agent already has a grant for that tool. Revoke it first to change it.";
    if (error.status === 404) return "The agent or tool could not be found. Refresh and try again.";
    if (error.status === 400) return "AgentShield did not accept this grant. Check the selected tool and actions.";
    if (error.status >= 500) return "AgentShield could not save the grant. Try again in a moment.";
    return "The grant was not saved. Try again.";
  }
  if (error instanceof TypeError) return "AgentShield could not be reached. Check the connection and try again.";
  return "The grant could not be saved.";
}

export function describeRevokeError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 401 || error.status === 403) {
      return "AgentShield rejected the admin key. Lock the console and unlock it again.";
    }
    if (error.status === 404) return "This grant no longer exists. The list has been refreshed.";
    if (error.status >= 500) return "AgentShield could not revoke the grant. Try again in a moment.";
    return "The grant was not revoked. Try again.";
  }
  if (error instanceof TypeError) return "AgentShield could not be reached. Check the connection and try again.";
  return "The grant could not be revoked.";
}

export function actionSummary(actions: readonly ActionType[]): string {
  return actions.length === 0 ? "None" : actions.map((action) => ACTION_LABELS[action]).join(", ");
}
