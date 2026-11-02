"use client";

import { DecisionBadge } from "@/components/security/decision-badge";
import { RiskScore } from "@/components/security/risk-score";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuditEvent } from "@/lib/queries/audit";
import {
  ACTION_LABELS,
  AUTHORIZATION_LABELS,
  OUTCOME_LABELS,
  SENSITIVITY_LABELS,
} from "@/lib/labels";
import { formatTimestamp } from "@/lib/format";
import {
  ESCALATION_COPY,
  escalationAttribution,
  formatTrajectoryScore,
  TRAJECTORY_TIER_LABELS,
  trajectoryEvidence,
} from "@/lib/trajectory/model";
import type { AuditLogResponse } from "@/types/api";
import { ActivityError } from "./activity-states";

interface ActivityDetailSheetProps {
  /** Selected gateway requestId. The sheet is open whenever this is set. */
  requestId: string | undefined;
  onClose: () => void;
}

/**
 * Loads one audit event by requestId, so the sheet also works for deep links to events that are
 * not on the current page. Every value shown is the backend's own text; nothing is paraphrased.
 */
export function ActivityDetailSheet({ requestId, onClose }: ActivityDetailSheetProps) {
  const query = useAuditEvent(requestId);

  return (
    <Sheet open={requestId !== undefined} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader className="pr-10">
          <SheetTitle>Decision detail</SheetTitle>
          <SheetDescription className="font-mono text-xs break-all">{requestId}</SheetDescription>
        </SheetHeader>

        <div className="flex flex-col gap-6 px-4 pb-6">
          {query.isPending && <DetailLoading />}
          {query.isError && <ActivityError error={query.error} onRetry={() => query.refetch()} />}
          {query.isSuccess && <DetailBody event={query.data} />}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function DetailLoading() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true" aria-label="Loading decision detail">
      <Skeleton className="h-6 w-40" />
      <Skeleton className="h-16 w-full" />
      <Skeleton className="h-24 w-full" />
    </div>
  );
}

function DetailBody({ event }: { event: AuditLogResponse }) {
  return (
    <>
      <DetailSection title="Decision">
        <div className="flex flex-col gap-3">
          <DecisionBadge decision={event.decision} className="h-7 self-start px-2.5 text-sm" />
          <p className="text-sm leading-relaxed">{event.reason}</p>
        </div>
      </DetailSection>

      <DetailSection title="What happened">
        <dl className="grid grid-cols-[7rem_1fr] gap-x-4 gap-y-3 text-sm">
          <Field label="Agent">
            <span className="font-mono text-xs break-all">{event.agentId}</span>
          </Field>
          <Field label="Tool">
            <span className="font-mono text-xs break-all">{event.tool}</span>
          </Field>
          <Field label="Action">{ACTION_LABELS[event.action]}</Field>
          <Field label="Resource">
            <span className="font-mono text-xs break-all">{event.resource}</span>
          </Field>
          <Field label="Sensitivity">{SENSITIVITY_LABELS[event.resourceSensitivity]}</Field>
        </dl>
      </DetailSection>

      <DetailSection title="Authorization">
        <dl className="grid grid-cols-[7rem_1fr] gap-x-4 gap-y-3 text-sm">
          <Field label="Result">{AUTHORIZATION_LABELS[event.authorizationResult]}</Field>
          <Field label="Reason">
            <span className="leading-relaxed">{event.authorizationReason}</span>
          </Field>
        </dl>
      </DetailSection>

      <DetailSection title="Risk">
        <div className="flex flex-col gap-2">
          <RiskScore score={event.riskScore} />
          <p className="text-xs text-muted-foreground">
            The policy risk score recorded for this request. Audit events do not store a risk tier.
          </p>
        </div>
      </DetailSection>

      <DetailSection title="Trajectory">
        <TrajectoryDetail event={event} />
      </DetailSection>

      <DetailSection title="Outcome">
        <div className="flex flex-col gap-2">
          <p className="text-sm">{OUTCOME_LABELS[event.actionOutcome]}</p>
          <p className="text-xs text-muted-foreground">
            Derived from the decision. AgentShield does not record whether the tool call ran afterwards.
          </p>
        </div>
      </DetailSection>

      <DetailSection title="Identifiers">
        <dl className="grid grid-cols-[7rem_1fr] gap-x-4 gap-y-3 text-sm">
          <Field label="Recorded">
            <time dateTime={event.timestamp} className="tabular-nums">
              {formatTimestamp(event.timestamp)}
            </time>
          </Field>
          <Field label="Session">
            <span className="font-mono text-xs break-all">{event.sessionId}</span>
          </Field>
          <Field label="Request">
            <span className="font-mono text-xs break-all">{event.requestId}</span>
          </Field>
          <Field label="Registered agent">
            <IdentifierValue value={event.registeredAgentId} />
          </Field>
          <Field label="Registered tool">
            <IdentifierValue value={event.registeredToolId} />
          </Field>
        </dl>
      </DetailSection>
    </>
  );
}

/**
 * Session-history signal, kept apart from the policy score above. Trajectory never changes the policy
 * risk score. The escalation line says which stage set the decision, and null means not recorded.
 */
function TrajectoryDetail({ event }: { event: AuditLogResponse }) {
  const evidence = trajectoryEvidence(event);
  const attribution = escalationAttribution(event.escalatedBy);

  return (
    <div className="flex flex-col gap-3">
      {evidence.kind === "evaluated" ? (
        <dl className="grid grid-cols-[7rem_1fr] gap-x-4 gap-y-3 text-sm">
          <Field label="Trajectory score">
            <span className="font-mono tabular-nums">{formatTrajectoryScore(evidence.score)}</span>
          </Field>
          <Field label="Tier">{evidence.tier ? TRAJECTORY_TIER_LABELS[evidence.tier] : "Not reported"}</Field>
          <Field label="Reason">
            <span className="leading-relaxed">{evidence.reason ?? "Not reported"}</span>
          </Field>
        </dl>
      ) : (
        <p className="text-sm text-muted-foreground">
          Not evaluated or unavailable. No trajectory signal was recorded for this request.
        </p>
      )}
      <dl className="grid grid-cols-[7rem_1fr] gap-x-4 gap-y-3 text-sm">
        <Field label="Escalation">
          <span className="leading-relaxed">{ESCALATION_COPY[attribution]}</span>
        </Field>
      </dl>
      <p className="text-xs text-muted-foreground">
        A session-history signal, separate from the policy risk score. It can only escalate an ALLOW to review.
      </p>
    </div>
  );
}

function DetailSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3 border-t pt-4">
      <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{title}</h3>
      {children}
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0">{children}</dd>
    </>
  );
}

function IdentifierValue({ value }: { value: string | null }) {
  if (value === null) {
    return <span className="text-muted-foreground">Not registered</span>;
  }
  return <span className="font-mono text-xs break-all">{value}</span>;
}
