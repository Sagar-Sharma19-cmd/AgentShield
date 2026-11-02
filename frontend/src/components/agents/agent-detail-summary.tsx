"use client";

import { AgentStatusBadge } from "@/components/agents/agent-status-badge";
import { formatTimestamp } from "@/lib/format";
import { describeAgentStatusEffect } from "@/lib/agents/detail-model";
import type { AgentResponse } from "@/types/api";

/** Label and value. Values come straight from the detail response; nothing is paraphrased. */
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words text-sm">{children}</dd>
    </div>
  );
}

/**
 * Identity, status and key prefix of one agent. The full API key is never part of the response
 * and is never rendered; only the non-secret prefix is shown.
 */
export function AgentDetailSummary({ agent, refreshing }: { agent: AgentResponse; refreshing: boolean }) {
  const effect = describeAgentStatusEffect(agent.status);

  return (
    <section aria-labelledby="agent-summary-heading" aria-busy={refreshing} className="flex flex-col gap-4">
      <h3 id="agent-summary-heading" className="sr-only">
        Agent summary
      </h3>
      <div className="flex flex-wrap items-center gap-2">
        <AgentStatusBadge status={agent.status} />
      </div>
      <p className="text-sm">{effect.summary}</p>
      <dl className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Field label="Description">
          <span className="whitespace-pre-wrap">{agent.description ?? "No description"}</span>
        </Field>
        <Field label="Agent ID">
          <span className="font-mono text-xs break-all">{agent.id}</span>
        </Field>
        <Field label="Key prefix">
          <span className="font-mono text-xs">{agent.apiKeyPrefix ?? "No active key"}</span>
        </Field>
        <Field label="Created">
          <time dateTime={agent.createdAt}>{formatTimestamp(agent.createdAt)}</time>
        </Field>
        <Field label="Updated">
          <time dateTime={agent.updatedAt}>{formatTimestamp(agent.updatedAt)}</time>
        </Field>
      </dl>
      <p className="text-xs text-muted-foreground">Only the key prefix is shown. The full key is never displayed here.</p>
    </section>
  );
}
