"use client";

import { AgentStatusBadge } from "@/components/agents/agent-status-badge";
import { EYEBROW_CLASS as EYEBROW } from "@/components/shell/page-header";
import { formatTimestamp } from "@/lib/format";
import { describeAgentStatusEffect } from "@/lib/agents/detail-model";
import type { AgentResponse } from "@/types/api";


/** Label and value. Values come straight from the detail response; nothing is paraphrased. */
function Field({ label, className, children }: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={`flex min-w-0 flex-col gap-0.5 ${className ?? ""}`}>
      <dt className={EYEBROW}>{label}</dt>
      <dd className="min-w-0 break-words text-sm">{children}</dd>
    </div>
  );
}

/**
 * Identity header of one agent: status stamp, name, key prefix and timestamps. The full API key is never part
 * of the response and is never rendered; only the non-secret prefix is shown.
 */
export function AgentDetailSummary({
  agent,
  refreshing,
  showTitle = false,
}: {
  agent: AgentResponse;
  refreshing: boolean;
  /** The pane shows the name as its heading; the sheet already has it in SheetTitle. */
  showTitle?: boolean;
}) {
  const effect = describeAgentStatusEffect(agent.status);

  return (
    <section aria-labelledby="agent-summary-heading" aria-busy={refreshing} className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <p className={EYEBROW}>Agent identity</p>
          {showTitle ? (
            <h2 id="agent-summary-heading" className="truncate font-mono text-lg font-semibold tracking-tight">
              {agent.name}
            </h2>
          ) : (
            <h3 id="agent-summary-heading" className="sr-only">
              Agent summary
            </h3>
          )}
        </div>
        <AgentStatusBadge status={agent.status} className="h-7 px-2.5 text-sm" />
      </div>
      <p className="text-sm">{effect.summary}</p>
      <dl className="grid grid-cols-1 gap-3 rounded-lg border border-border p-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Field label="Key prefix">
          <span className="font-mono text-xs">{agent.apiKeyPrefix ?? "No active key"}</span>
        </Field>
        <Field label="Agent ID">
          <span className="font-mono text-xs break-all">{agent.id}</span>
        </Field>
        <Field label="Created">
          <time dateTime={agent.createdAt} className="font-mono text-xs tabular-nums">
            {formatTimestamp(agent.createdAt)}
          </time>
        </Field>
        <Field label="Updated">
          <time dateTime={agent.updatedAt} className="font-mono text-xs tabular-nums">
            {formatTimestamp(agent.updatedAt)}
          </time>
        </Field>
        <Field label="Description" className="sm:col-span-2">
          <span className="whitespace-pre-wrap">{agent.description ?? "No description"}</span>
        </Field>
      </dl>
      <p className="text-xs text-muted-foreground">Only the key prefix is shown. The full key is never displayed here.</p>
    </section>
  );
}
