/**
 * Resolves the agent a request names. Pure; tested in resolve.test.ts.
 *
 * The `agentId` on audit rows and review requests is whatever the agent sent to the gateway: usually the
 * registered agent's UUID, but some agents (for example jenkins-ci-agent, via agentshield-guard) send their
 * registered name. Every place that turns that value into a registry agent (to show its name, link to it or
 * load its grants) uses this one helper, so they all agree.
 */
import type { AgentResponse } from "@/types/api";

/** The registry agent whose id equals the value, else the one whose name equals it exactly, else null. */
export function resolveAgent<T extends Pick<AgentResponse, "id" | "name">>(
  agentIdOrName: string,
  agents: readonly T[],
): T | null {
  return agents.find((agent) => agent.id === agentIdOrName) ?? agents.find((agent) => agent.name === agentIdOrName) ?? null;
}
