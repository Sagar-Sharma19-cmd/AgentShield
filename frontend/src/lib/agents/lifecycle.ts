import type { AgentStatus } from "@/types/api";

/** Lifecycle changes an operator can make to an agent. */
export type LifecycleAction = "suspend" | "reactivate" | "revoke" | "rotate";

/**
 * Which actions each status allows. Keyed by the AgentStatus enum, so adding a status is a compile
 * error until it is given an entry here. Decisions use the enum value only, never a badge colour or
 * label.
 */
const AVAILABLE_ACTIONS: Record<AgentStatus, readonly LifecycleAction[]> = {
  ACTIVE: ["suspend", "revoke", "rotate"],
  SUSPENDED: ["reactivate", "revoke", "rotate"],
  REVOKED: [],
};

/** The status a status-changing action sets. Rotation changes the key, not the status. */
const TARGET_STATUS: Record<Exclude<LifecycleAction, "rotate">, AgentStatus> = {
  suspend: "SUSPENDED",
  reactivate: "ACTIVE",
  revoke: "REVOKED",
};

/** Actions an agent in this status can take, in display order. Empty for REVOKED. */
export function availableLifecycleActions(status: AgentStatus): readonly LifecycleAction[] {
  return AVAILABLE_ACTIONS[status];
}

export function isLifecycleActionAvailable(status: AgentStatus, action: LifecycleAction): boolean {
  return AVAILABLE_ACTIONS[status].includes(action);
}

/** The status a status-changing action sets, or null for rotation. */
export function targetStatusFor(action: LifecycleAction): AgentStatus | null {
  return action === "rotate" ? null : TARGET_STATUS[action];
}

/**
 * Revoke is irreversible, so the operator must type the agent's registered name. The match is exact:
 * case-sensitive, with no trimming and no partial matches. An empty name never matches, so an agent
 * with no name cannot be revoked by pressing Enter on an empty field.
 */
export function isRevokeConfirmed(agentName: string, typedName: string): boolean {
  return agentName.length > 0 && typedName === agentName;
}
