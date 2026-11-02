import type { IssuedAgentKey } from "@/lib/queries/agents";

/**
 * The one plaintext key the UI may hold, or null. It lives only in the lifecycle section's local
 * state (via useReducer). Nothing else reads it: not query or mutation state, the URL, storage or logs.
 */
export type OneTimeKeyState = IssuedAgentKey | null;

export type OneTimeKeyAction =
  /** A rotation returned a key. Replaces any key already held. */
  | { type: "issued"; issued: IssuedAgentKey }
  /** The operator confirmed they saved the key. */
  | { type: "acknowledged" }
  /** The operator chose to leave without saving. The key is the only copy, so it is dropped. */
  | { type: "discarded" }
  /** The admin session was locked. The key must not survive it. */
  | { type: "session-locked" };

export function oneTimeKeyReducer(state: OneTimeKeyState, action: OneTimeKeyAction): OneTimeKeyState {
  switch (action.type) {
    case "issued":
      return { agentId: action.issued.agentId, apiKey: action.issued.apiKey };
    case "acknowledged":
    case "discarded":
    case "session-locked":
      return null;
  }
}

/** The key to display for this agent, or null. A key issued for another agent is never returned. */
export function keyForAgent(state: OneTimeKeyState, agentId: string): string | null {
  return state !== null && state.agentId === agentId ? state.apiKey : null;
}
