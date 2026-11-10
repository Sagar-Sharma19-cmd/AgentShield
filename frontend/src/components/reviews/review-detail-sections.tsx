"use client";

import { DecisionBadge } from "@/components/security/decision-badge";
import { RiskScore } from "@/components/security/risk-score";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError } from "@/lib/api/client";
import { formatTimestamp } from "@/lib/format";
import {
  ACTION_LABELS,
  AGENT_STATUS_LABELS,
  AUTHORIZATION_LABELS,
  DECISION_LABELS,
  OUTCOME_LABELS,
  SENSITIVITY_LABELS,
} from "@/lib/labels";
import { useAuditEvent } from "@/lib/queries/audit";
import { useAgentGrants } from "@/lib/queries/agents";
import {
  ESCALATION_COPY,
  escalationAttribution,
  formatTrajectoryScore,
  TRAJECTORY_TIER_LABELS,
  trajectoryEvidence,
} from "@/lib/trajectory/model";
import { TrajectoryEscalationBadge } from "@/components/trajectory/trajectory-evidence";
import type { ReviewRequestResponse } from "@/types/api";
import type { AgentResolution } from "@/lib/reviews/model";

/** Label and value pair. Values are shown exactly as the backend returned them, with no paraphrase. */
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words text-sm">{children}</dd>
    </div>
  );
}

function SectionHeading({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <h3 id={id} className="text-sm font-medium">
      {children}
    </h3>
  );
}

/** Agent name and status. Absence is only reported once the registry has loaded successfully. */
function agentFields(resolution: AgentResolution): { name: string; status: string } {
  switch (resolution.kind) {
    case "loading":
      return { name: "Loading…", status: "Loading…" };
    case "error":
      return { name: "Could not load the agent registry", status: "Unknown" };
    case "absent":
      return { name: "Not in the agent registry", status: "Unknown" };
    case "found":
      return { name: resolution.agent.name, status: AGENT_STATUS_LABELS[resolution.agent.status] };
  }
}

export function AgentToolSection({
  review,
  agent,
}: {
  review: ReviewRequestResponse;
  agent: AgentResolution;
}) {
  const fields = agentFields(agent);
  return (
    <section aria-labelledby="review-agent-heading" className="flex flex-col gap-3">
      <SectionHeading id="review-agent-heading">Agent and requested tool</SectionHeading>
      <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Agent">{fields.name}</Field>
        <Field label="Agent status">{fields.status}</Field>
        <Field label="Agent ID">
          <span className="font-mono text-xs">{review.agentId}</span>
        </Field>
        <Field label="Requested tool">
          <span className="font-mono text-xs">{review.tool}</span>
        </Field>
        <Field label="Session">
          <span className="font-mono text-xs">{review.sessionId}</span>
        </Field>
      </dl>
    </section>
  );
}

export function RequestSection({ review }: { review: ReviewRequestResponse }) {
  return (
    <section aria-labelledby="review-request-heading" className="flex flex-col gap-3">
      <SectionHeading id="review-request-heading">Request</SectionHeading>
      <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Action">{ACTION_LABELS[review.action]}</Field>
        <Field label="Resource sensitivity">{SENSITIVITY_LABELS[review.resourceSensitivity]}</Field>
        <Field label="Resource">
          <span className="font-mono text-xs">{review.resource}</span>
        </Field>
        <Field label="Policy decision before escalation">{DECISION_LABELS[review.originalDecision]}</Field>
        <Field label="Gateway request ID">
          <span className="font-mono text-xs break-all">{review.requestId}</span>
        </Field>
        <Field label="Created">
          <time dateTime={review.createdAt}>{formatTimestamp(review.createdAt)}</time>
        </Field>
        <Field label="Last updated">
          <time dateTime={review.updatedAt}>{formatTimestamp(review.updatedAt)}</time>
        </Field>
        <Field label="Reviewed">
          {review.reviewedAt ? (
            <time dateTime={review.reviewedAt}>{formatTimestamp(review.reviewedAt)}</time>
          ) : (
            "Not yet decided"
          )}
        </Field>
        <Field label="Reviewer">{review.reviewer ?? "Not yet decided"}</Field>
        <Field label="Expires">
          <time dateTime={review.expiresAt}>{formatTimestamp(review.expiresAt)}</time>
          {review.expired ? <span className="ml-1.5 font-medium">(expired)</span> : null}
        </Field>
        <Field label="Reviewer note">
          {review.note ? <span className="whitespace-pre-wrap">{review.note}</span> : <span className="text-muted-foreground">No note</span>}
        </Field>
        <Field label="Claimed by the agent">
          {review.consumedAt ? (
            <time dateTime={review.consumedAt}>{formatTimestamp(review.consumedAt)}</time>
          ) : review.status === "APPROVED" ? (
            "Not yet claimed"
          ) : (
            "Not applicable"
          )}
        </Field>
      </dl>
      <div className="flex flex-col gap-1">
        <p className="text-xs text-muted-foreground">Effective risk score (higher of Risk Engine and trajectory)</p>
        <RiskScore score={review.riskScore} />
      </div>
    </section>
  );
}

/**
 * Trajectory signal recorded on the review. The effective risk score above is the higher of the Risk Engine
 * and trajectory values, so a trajectory escalation can raise it. A null value means trajectory was not
 * evaluated, not that it scored zero.
 */
export function TrajectorySection({ review }: { review: ReviewRequestResponse }) {
  const evidence = trajectoryEvidence(review);

  return (
    <section aria-labelledby="review-trajectory-heading" className="flex flex-col gap-3">
      <SectionHeading id="review-trajectory-heading">Trajectory evidence</SectionHeading>
      {evidence.kind === "evaluated" ? (
        <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Trajectory score">
            <span className="font-mono text-xs tabular-nums">{formatTrajectoryScore(evidence.score)}</span>
          </Field>
          <Field label="Tier">{evidence.tier ? TRAJECTORY_TIER_LABELS[evidence.tier] : "Not reported"}</Field>
          <Field label="Reason">{evidence.reason ?? "Not reported"}</Field>
        </dl>
      ) : (
        <p className="text-sm text-muted-foreground">
          Not evaluated or unavailable for this request.
        </p>
      )}
      <p className="text-xs text-muted-foreground">
        Session-history signal. Approving or rejecting does not change it or the effective risk score.
      </p>
    </section>
  );
}

/** The agent's current grant for the requested tool. An approval never changes this. */
export function GrantSection({ agentId, tool }: { agentId: string; tool: string }) {
  const query = useAgentGrants(agentId);

  return (
    <section aria-labelledby="review-grant-heading" className="flex flex-col gap-3">
      <SectionHeading id="review-grant-heading">Current permission grant</SectionHeading>
      {query.isPending ? (
        <Skeleton className="h-10 w-full" />
      ) : query.isError ? (
        <p role="alert" className="text-sm text-danger-text">
          Grants for this agent could not be loaded: {query.error.message}
        </p>
      ) : (
        <GrantSummary grants={query.data} tool={tool} />
      )}
      <p className="text-xs text-muted-foreground">
        Approving or rejecting a review does not change this grant.
      </p>
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

/** Audit row for the same gateway request. Policy score and reason come from PolicyEngine, not the Risk Engine. */
export function AuditSection({ requestId }: { requestId: string }) {
  const query = useAuditEvent(requestId);
  const notFound = query.error instanceof ApiError && query.error.status === 404;

  return (
    <section aria-labelledby="review-audit-heading" className="flex flex-col gap-3">
      <SectionHeading id="review-audit-heading">Audit record</SectionHeading>
      {query.isPending ? (
        <Skeleton className="h-24 w-full" />
      ) : notFound ? (
        <p className="text-sm text-muted-foreground">No audit event is recorded for this gateway request.</p>
      ) : query.isError ? (
        <p role="alert" className="text-sm text-danger-text">
          The audit record could not be loaded: {query.error.message}
        </p>
      ) : (
        <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Recorded decision">
            <DecisionBadge decision={query.data.decision} />
          </Field>
          <Field label="Policy score">
            <RiskScore score={query.data.riskScore} />
          </Field>
          <Field label="Authorization">{AUTHORIZATION_LABELS[query.data.authorizationResult]}</Field>
          <Field label="Escalation">
            <span className="flex flex-col items-start gap-1">
              <span>{ESCALATION_COPY[escalationAttribution(query.data.escalatedBy)]}</span>
              <TrajectoryEscalationBadge escalatedBy={query.data.escalatedBy} />
            </span>
          </Field>
          <Field label="Outcome">{OUTCOME_LABELS[query.data.actionOutcome]}</Field>
          <Field label="Policy reason">{query.data.reason}</Field>
          <Field label="Authorization reason">{query.data.authorizationReason}</Field>
          <Field label="Recorded at">
            <time dateTime={query.data.timestamp}>{formatTimestamp(query.data.timestamp)}</time>
          </Field>
        </dl>
      )}
    </section>
  );
}
