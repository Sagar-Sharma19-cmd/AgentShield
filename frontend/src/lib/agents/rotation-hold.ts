/**
 * What the lifecycle section reports to the detail sheet. It says nothing about the URL.
 */
export interface RotationHold {
  agentId: string;
  /** The rotation request has not settled yet. Dismissal is blocked. */
  pending: boolean;
  /** A key was issued and has not been acknowledged or discarded. */
  keyOpen: boolean;
}

export interface SheetAgentView {
  /** Agent the sheet shows, or undefined when it should be closed. */
  shownAgentId: string | undefined;
  /** True while the sheet must not be dismissed by Escape, outside click, the close control or Back. */
  dismissBlocked: boolean;
}

/**
 * Resolves what the sheet shows from the URL agent and the rotation hold.
 *
 * - While a rotation is pending, the held agent stays shown and dismissal is blocked, even if the URL
 *   has moved on (Back). Unrelated lifecycle actions never set a hold.
 * - While an issued key is unacknowledged, the sheet stays on the held agent whenever the URL moves
 *   away from it. The operator must then choose to stay (the URL is restored) or discard the key.
 * - With no hold, or once the key is acknowledged or discarded, the URL decides and dismissal works.
 */
export function resolveSheetAgent(urlAgentId: string | undefined, hold: RotationHold | null): SheetAgentView {
  if (hold === null) return { shownAgentId: urlAgentId, dismissBlocked: false };

  const pinnedForKey = hold.keyOpen && urlAgentId !== hold.agentId;
  const holdsSheet = hold.pending || pinnedForKey;
  return {
    shownAgentId: holdsSheet ? hold.agentId : urlAgentId,
    dismissBlocked: hold.pending,
  };
}

/**
 * True while an unacknowledged key must be protected by the leave confirmation: the URL has moved away
 * from the agent that holds the key, or the operator tried to leave with Escape, outside click or close.
 */
export function isLeavingUnacknowledgedKey(
  urlAgentId: string | undefined,
  hold: RotationHold | null,
  leaveRequested: boolean,
): boolean {
  if (hold === null || !hold.keyOpen) return false;
  return leaveRequested || urlAgentId !== hold.agentId;
}
