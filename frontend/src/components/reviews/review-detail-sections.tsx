"use client";

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { CopyButton } from "@/components/activity/copy-button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatTimestamp } from "@/lib/format";
import { ACTION_LABELS, DECISION_LABELS, SENSITIVITY_LABELS } from "@/lib/labels";
import { useAgentGrants } from "@/lib/queries/agents";
import { grantRequestFor, type AgentResolution } from "@/lib/reviews/model";
import type { ReviewRequestResponse } from "@/types/api";

/** Label and value pair. Values are shown exactly as the backend returned them, with no paraphrase. */
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <dt className="font-mono text-[0.6875rem] tracking-wide text-muted-foreground uppercase">{label}</dt>
      <dd className="min-w-0 break-words text-sm">{children}</dd>
    </div>
  );
}

/** A monospace identifier with a copy button. The value is always shown in full. */
function CopyField({ label, value }: { label: string; value: string }) {
  return (
    <Field label={label}>
      <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
        <span className="min-w-0 font-mono text-xs break-all">{value}</span>
        <CopyButton value={value} label={`Copy ${label.toLowerCase()}`} />
      </span>
    </Field>
  );
}

export function activityHref(requestId: string): string {
  return `/activity?request=${encodeURIComponent(requestId)}`;
}

/** Facts recorded on the review, with copy buttons for identifiers and a link to the same request in Activity. */
export function RequestFacts({ review, agentName }: { review: ReviewRequestResponse; agentName: string | null }) {
  return (
    <section aria-labelledby="review-facts-heading" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id="review-facts-heading" className="text-sm font-medium">
          Request facts
        </h3>
        <Link
          href={activityHref(review.requestId)}
          className="inline-flex items-center gap-1 rounded-sm text-sm text-primary underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
        >
          Open in Activity
          <ArrowUpRight aria-hidden="true" className="size-3.5" />
        </Link>
      </div>
      <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <CopyField label="Gateway request ID" value={review.requestId} />
        <CopyField label="Review ID" value={review.id} />
        <CopyField label="Session" value={review.sessionId} />
        <CopyField label="Agent ID" value={review.agentId} />
        <Field label="Agent">{agentName ?? <span className="text-muted-foreground">Not in the agent registry</span>}</Field>
        <Field label="Tool">
          <span className="font-mono text-xs">{review.tool}</span>
        </Field>
        <Field label="Action">{ACTION_LABELS[review.action]}</Field>
        <Field label="Resource sensitivity">{SENSITIVITY_LABELS[review.resourceSensitivity]}</Field>
        <div className="sm:col-span-2">
          <CopyField label="Resource" value={review.resource} />
        </div>
        <Field label="Policy decision before escalation">{DECISION_LABELS[review.originalDecision]}</Field>
        <Field label="Created">
          <time dateTime={review.createdAt}>{formatTimestamp(review.createdAt)}</time>
        </Field>
        <Field label="Expires">
          <time dateTime={review.expiresAt}>{formatTimestamp(review.expiresAt)}</time>
        </Field>
        <Field label="Last updated">
          <time dateTime={review.updatedAt}>{formatTimestamp(review.updatedAt)}</time>
        </Field>
      </dl>
    </section>
  );
}

/**
 * The agent's current grant for the requested tool. An approval never changes this. Grants are requested only
 * with the resolved registry UUID; an agent that is not in the registry gets a note, not a failed request.
 */
export function GrantSection({ agent, tool }: { agent: AgentResolution; tool: string }) {
  const request = grantRequestFor(agent);
  const query = useAgentGrants(request.kind === "fetch" ? request.agentId : undefined);

  return (
    <section aria-labelledby="review-grant-heading" className="flex flex-col gap-3">
      <h3 id="review-grant-heading" className="text-sm font-medium">
        Current permission grant
      </h3>
      {request.kind === "skip" ? (
        <p className="text-sm text-muted-foreground">{request.note}</p>
      ) : request.kind === "waiting" || query.isPending ? (
        <Skeleton className="h-10 w-full" />
      ) : query.isError ? (
        <p role="alert" className="text-sm text-danger-text">
          Grants for this agent could not be loaded: {query.error.message}
        </p>
      ) : (
        <GrantSummary grants={query.data} tool={tool} />
      )}
      <p className="text-xs text-muted-foreground">Approving or rejecting a review does not change this grant.</p>
    </section>
  );
}

function GrantSummary({
  grants,
  tool,
}: {
  grants: { toolName: string; allowedActions: string[]; enabled: boolean }[];
  tool: string;
}) {
  const grant = grants.find((item) => item.toolName === tool);
  if (!grant) {
    return <p className="text-sm">No permission grant exists for this tool.</p>;
  }
  if (!grant.enabled) {
    return <p className="text-sm">A grant exists for this tool but is disabled.</p>;
  }
  return (
    <p className="text-sm">
      Allowed actions:{" "}
      {grant.allowedActions.map((action) => ACTION_LABELS[action as keyof typeof ACTION_LABELS] ?? action).join(", ") ||
        "none"}
    </p>
  );
}
