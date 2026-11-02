import { z } from "zod";
import { ApiError } from "@/lib/api/client";
import type { AgentResponse, AgentStatus } from "@/types/api";

/** Backend lifecycle statuses, in the order the status tabs show them. */
export const AGENT_STATUSES = ["ACTIVE", "SUSPENDED", "REVOKED"] as const satisfies readonly AgentStatus[];

/** "ALL" is a view filter only. It is not an agent status. */
export const AGENT_STATUS_FILTERS = ["ALL", ...AGENT_STATUSES] as const;
export type AgentStatusFilter = (typeof AGENT_STATUS_FILTERS)[number];

export const AGENT_STATUS_FILTER_LABELS: Record<AgentStatusFilter, string> = {
  ALL: "All",
  ACTIVE: "Active",
  SUSPENDED: "Suspended",
  REVOKED: "Revoked",
};

/**
 * URL state for the Agents page. Unknown or malformed values fall back to safe defaults rather than
 * an error page: "ALL" for the status filter and no selection for the agent. Matching is
 * case-sensitive, so "active" is treated as unknown.
 */
const agentUrlSchema = z.object({
  status: z.enum(AGENT_STATUS_FILTERS).catch("ALL"),
  agent: z.uuid().optional().catch(undefined),
});

export type AgentUrlState = z.infer<typeof agentUrlSchema>;

export function parseAgentParams(raw: Record<string, string | string[] | undefined>): AgentUrlState {
  const flat: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(raw)) {
    flat[key] = Array.isArray(value) ? value[0] : value;
  }
  return agentUrlSchema.parse(flat);
}

/**
 * Builds an /agents href. Parameters not owned by this page are kept, so unrelated query strings
 * survive a filter change. "ALL" and an empty selection are removed rather than written.
 */
export function buildAgentsHref(
  next: { status: AgentStatusFilter; agent?: string },
  current: URLSearchParams = new URLSearchParams(),
): string {
  const params = new URLSearchParams(current);
  if (next.status === "ALL") params.delete("status");
  else params.set("status", next.status);
  if (next.agent) params.set("agent", next.agent);
  else params.delete("agent");
  const query = params.toString();
  return query === "" ? "/agents" : `/agents?${query}`;
}

/** Trimmed, lower-cased search text. Whitespace-only input means "no search". */
export function normalizeAgentSearch(input: string): string {
  return input.trim().toLowerCase();
}

/** Matches the agent name or description, case-insensitively. A null description never matches. */
export function matchesAgentSearch(
  agent: Pick<AgentResponse, "name" | "description">,
  search: string,
): boolean {
  const needle = normalizeAgentSearch(search);
  if (needle === "") return true;
  return (
    agent.name.toLowerCase().includes(needle) ||
    (agent.description ?? "").toLowerCase().includes(needle)
  );
}

export function filterAgents<T extends Pick<AgentResponse, "name" | "description" | "status">>(
  agents: readonly T[],
  { search, status }: { search: string; status: AgentStatusFilter },
): T[] {
  return agents.filter(
    (agent) => (status === "ALL" || agent.status === status) && matchesAgentSearch(agent, search),
  );
}

/** Plain code-unit comparison. localeCompare depends on the browser locale, so it is not used here. */
function compareText(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

/** Unparseable timestamps sort last instead of producing NaN, which makes comparators inconsistent. */
function timeOf(iso: string): number {
  const value = Date.parse(iso);
  return Number.isNaN(value) ? Number.NEGATIVE_INFINITY : value;
}

/**
 * Newest first. Ties on creation time are broken by name, then by id, so the order is the same on
 * every render and every browser. The backend returns agents oldest first and no order is relied on.
 */
export function sortAgentsNewestFirst<T extends Pick<AgentResponse, "createdAt" | "name" | "id">>(
  agents: readonly T[],
): T[] {
  return [...agents].sort((a, b) => {
    const byTime = compareTime(timeOf(b.createdAt), timeOf(a.createdAt));
    if (byTime !== 0) return byTime;
    return compareText(a.name, b.name) || compareText(a.id, b.id);
  });
}

function compareTime(a: number, b: number): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

/** Counts over the whole registry, not the filtered view, so the tabs show what exists. */
export function countAgentsByStatus(
  agents: readonly Pick<AgentResponse, "status">[],
): Record<AgentStatusFilter, number> {
  const counts: Record<AgentStatusFilter, number> = { ALL: agents.length, ACTIVE: 0, SUSPENDED: 0, REVOKED: 0 };
  for (const agent of agents) counts[agent.status] += 1;
  return counts;
}

export interface AgentRegistryErrorCopy {
  title: string;
  body: string;
  /** A rejected admin key is fixed by unlocking again; every other failure is retried. */
  action: "unlock" | "retry";
}

/**
 * Copy for a failed registry request. The backend message is never shown: 5xx bodies can contain
 * generic evaluation text, and 4xx messages are not written for this page. Network failures are
 * recognised by fetch rejecting with a TypeError, not by message text.
 */
export function describeAgentRegistryError(error: unknown): AgentRegistryErrorCopy {
  if (error instanceof ApiError) {
    if (error.status === 401 || error.status === 403) {
      return {
        title: "AgentShield rejected the admin key",
        body: "The key may be wrong or no longer valid. Lock the console and unlock it again.",
        action: "unlock",
      };
    }
    if (error.status >= 500) {
      return {
        title: "The agent registry is temporarily unavailable",
        body: "The server could not complete the request. Try again in a moment.",
        action: "retry",
      };
    }
    if (error.status === 404) {
      return {
        title: "The agent registry could not be found",
        body: "The console could not reach the registry endpoint. Check that the backend version matches this console.",
        action: "retry",
      };
    }
    return {
      title: "The registry request was rejected",
      body: "Try again. If this continues, check the backend logs for the request.",
      action: "retry",
    };
  }
  if (error instanceof TypeError) {
    return {
      title: "AgentShield could not be reached",
      body: "Check that the backend is running and that this browser can reach it, then try again.",
      action: "retry",
    };
  }
  return {
    title: "The agent registry could not be loaded",
    body: "Try again. If this continues, reload the page.",
    action: "retry",
  };
}
