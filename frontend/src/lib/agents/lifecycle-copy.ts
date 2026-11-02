import { isRevokeConfirmed, type LifecycleAction } from "@/lib/agents/lifecycle";
import type { AgentStatus } from "@/types/api";

/** Button text for each lifecycle action. Status rules stay in lifecycle.ts; this is wording only. */
export const LIFECYCLE_BUTTON_LABELS: Record<LifecycleAction, string> = {
  suspend: "Suspend",
  reactivate: "Reactivate",
  revoke: "Revoke",
  rotate: "Rotate key",
};

export interface LifecycleConfirmCopy {
  title: string;
  /** Paragraphs in display order. Each one states a consequence the operator is accepting. */
  paragraphs: string[];
  confirmLabel: string;
  pendingLabel: string;
  /** Only revoke requires the operator to type the agent's exact name before confirming. */
  requiresTypedName: boolean;
}

/**
 * Confirmation copy for one lifecycle action. Wording must not imply that grants are deleted or
 * recreated, and must not suggest that revocation can be undone.
 */
export function lifecycleConfirmCopy(
  action: LifecycleAction,
  agentName: string,
  status: AgentStatus,
): LifecycleConfirmCopy {
  switch (action) {
    case "suspend":
      return {
        title: `Suspend ${agentName}?`,
        paragraphs: [
          "Gateway requests from this agent will be denied until it is reactivated.",
          "Its API key is kept and its permission grants stay assigned, so reactivating it restores access with the same key and grants.",
        ],
        confirmLabel: "Suspend agent",
        pendingLabel: "Suspending…",
        requiresTypedName: false,
      };
    case "reactivate":
      return {
        title: `Reactivate ${agentName}?`,
        paragraphs: [
          "The agent can authenticate with its existing key again, and its current permission grants apply.",
          "No grants are deleted or recreated.",
        ],
        confirmLabel: "Reactivate agent",
        pendingLabel: "Reactivating…",
        requiresTypedName: false,
      };
    case "revoke":
      return {
        title: `Revoke ${agentName} permanently?`,
        paragraphs: [
          "Revocation is permanent and cannot be undone.",
          "The agent's API key is destroyed, so it can never authenticate again.",
          "Its permission grants stay assigned to it but cannot be used.",
          "Type the agent's exact name below to confirm.",
        ],
        confirmLabel: "Revoke permanently",
        pendingLabel: "Revoking…",
        requiresTypedName: true,
      };
    case "rotate": {
      const paragraphs = [
        "The current key stops working as soon as the new key is issued.",
        "Give the new key to the agent before it sends another request, or its requests will be denied.",
      ];
      if (status === "SUSPENDED") {
        paragraphs.push("This agent is suspended. Rotating the key does not reactivate it; it stays suspended until you reactivate it.");
      }
      return {
        title: `Rotate the API key for ${agentName}?`,
        paragraphs,
        confirmLabel: "Rotate key",
        pendingLabel: "Rotating…",
        requiresTypedName: false,
      };
    }
  }
}

export interface LifecycleConfirmState {
  action: LifecycleAction;
  agentName: string;
  typedName: string;
  pending: boolean;
}

/** Whether the confirm button may be pressed. Pending requests can never be confirmed again. */
export function canConfirmLifecycleAction({ action, agentName, typedName, pending }: LifecycleConfirmState): boolean {
  if (pending) return false;
  if (action === "revoke") return isRevokeConfirmed(agentName, typedName);
  return true;
}
