import { ApiError } from "@/lib/api/client";
import type { AgentStatus, PermissionResponse } from "@/types/api";

/** Plain code-unit comparison, so the order does not depend on the browser locale. */
function compareText(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

/**
 * Grants sorted by tool name, then grant id. The backend returns grants in no defined order.
 * Returns a new array; the input is not changed.
 */
export function sortGrantsForDisplay<T extends Pick<PermissionResponse, "toolName" | "id">>(grants: readonly T[]): T[] {
  return [...grants].sort((a, b) => compareText(a.toolName, b.toolName) || compareText(a.id, b.id));
}

export interface AgentStatusEffect {
  /** One sentence describing what the status means for gateway requests. */
  summary: string;
  /** Whether this agent's grants can be used for requests right now. */
  grantsUsable: boolean;
  /** Extra line shown with the grants, when the grants are not in effect. */
  grantsNote?: string;
}

/**
 * Plain-language effect of each status, grounded in the backend: ACTIVE agents are authorised
 * against their grants; SUSPENDED agents are denied (their key still authenticates); REVOKED agents
 * fail authentication because their key is removed.
 */
export function describeAgentStatusEffect(status: AgentStatus): AgentStatusEffect {
  switch (status) {
    case "ACTIVE":
      return {
        summary: "Requests from this agent are checked against its grants.",
        grantsUsable: true,
      };
    case "SUSPENDED":
      return {
        summary: "Gateway requests from this agent are denied while it is suspended. Its key is kept.",
        grantsUsable: false,
        grantsNote: "This agent is suspended, so these grants are not currently usable.",
      };
    case "REVOKED":
      return {
        summary: "This agent is revoked. Its key was removed, so it cannot authenticate.",
        grantsUsable: false,
        grantsNote: "This agent is revoked, so these grants are not usable.",
      };
  }
}

export function isAgentNotFound(error: unknown): boolean {
  return error instanceof ApiError && error.status === 404;
}

export interface AgentLoadErrorCopy {
  title: string;
  body: string;
  action: "unlock" | "retry";
}

type Subject = "agent" | "grants";

const SUBJECT_COPY: Record<Subject, { unavailable: string; notFound: string; rejected: string; unexpected: string }> = {
  agent: {
    unavailable: "Agent details are temporarily unavailable",
    notFound: "Agent details could not be found",
    rejected: "The request for agent details was rejected",
    unexpected: "Agent details could not be loaded",
  },
  grants: {
    unavailable: "Permission grants are temporarily unavailable",
    notFound: "Permission grants could not be found",
    rejected: "The request for permission grants was rejected",
    unexpected: "Permission grants could not be loaded",
  },
};

/**
 * Copy for a failed agent-detail or grants request. Like describeAgentRegistryError, it never
 * includes the backend message or the error text, so no server detail reaches the page.
 */
export function describeAgentDetailError(error: unknown, subject: Subject): AgentLoadErrorCopy {
  const copy = SUBJECT_COPY[subject];
  if (error instanceof ApiError) {
    if (error.status === 401 || error.status === 403) {
      return {
        title: "AgentShield rejected the admin key",
        body: "The key may be wrong or no longer valid. Lock the console and unlock it again.",
        action: "unlock",
      };
    }
    if (error.status >= 500) {
      return { title: copy.unavailable, body: "The server could not complete the request. Try again in a moment.", action: "retry" };
    }
    if (error.status === 404) {
      return { title: copy.notFound, body: "The agent may have been removed. Refresh the registry to check.", action: "retry" };
    }
    return { title: copy.rejected, body: "Try again. If this continues, check the backend logs for the request.", action: "retry" };
  }
  if (error instanceof TypeError) {
    return {
      title: "AgentShield could not be reached",
      body: "Check that the backend is running and that this browser can reach it, then try again.",
      action: "retry",
    };
  }
  return { title: copy.unexpected, body: "Try again. If this continues, reload the page.", action: "retry" };
}

/**
 * Toast text for a failed lifecycle change (status or key rotation). Backend messages are never shown,
 * because they can echo request detail, and no key material can reach this text.
 */
export function describeAgentActionError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 401 || error.status === 403) {
      return "AgentShield rejected the admin key. Lock the console and unlock it again.";
    }
    if (error.status === 404) return "This agent could not be found. Refresh the registry and try again.";
    if (error.status === 409) {
      return "This agent is revoked, so it cannot be suspended, reactivated or given a new key. Revocation is permanent.";
    }
    if (error.status >= 500) return "AgentShield could not complete the change. Try again in a moment.";
    return "The change was not made. Refresh and try again.";
  }
  if (error instanceof TypeError) return "AgentShield could not be reached. Check the connection and try again.";
  return "The change could not be completed.";
}
