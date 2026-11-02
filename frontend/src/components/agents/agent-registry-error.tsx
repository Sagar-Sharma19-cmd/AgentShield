"use client";

import { AgentLoadError } from "@/components/agents/agent-load-error";
import { describeAgentRegistryError } from "@/lib/agents/model";

/** Registry failure panel. Copy comes from describeAgentRegistryError, which hides backend text. */
export function AgentRegistryError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  return <AgentLoadError copy={describeAgentRegistryError(error)} onRetry={onRetry} />;
}
