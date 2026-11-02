"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { DecisionBadge } from "@/components/security/decision-badge";
import { Button } from "@/components/ui/button";
import { formatTimestamp } from "@/lib/format";
import { ACTION_LABELS, AUTHORIZATION_LABELS } from "@/lib/labels";
import { DASHBOARD_INCIDENT_LIMIT, useRecentEvaluations, useRecentIncidents } from "@/lib/queries/dashboard";
import type { AuditLogResponse } from "@/types/api";
import { DashboardCard, SectionEmpty, SectionError, SectionSkeleton } from "./section-states";

/** Rows shown in the overview activity list. The full history lives on the Activity page. */
const RECENT_ACTIVITY_LIMIT = 8;

/** Recent DENY decisions. Each row opens its audit detail on the Activity page. */
export function RecentIncidentsCard() {
  const query = useRecentIncidents();

  return (
    <DashboardCard
      title="Recent denied requests"
      description="Requests AgentShield denied, with the policy reason for each."
      action={<ViewAllLink href="/activity?decision=DENY" label="View denied" />}
    >
      {query.isPending ? (
        <SectionSkeleton label="Loading recent denied requests" rows={3} />
      ) : query.isError ? (
        <SectionError error={query.error} onRetry={() => void query.refetch()} subject="denied requests" />
      ) : query.data.content.length === 0 ? (
        <SectionEmpty
          title="No denied requests"
          body={`Denied requests appear here, up to the latest ${DASHBOARD_INCIDENT_LIMIT}, so you can see what was blocked and why.`}
        />
      ) : (
        <ul className="flex flex-col divide-y">
          {query.data.content.map((event) => (
            <IncidentRow key={event.id} event={event} />
          ))}
        </ul>
      )}
    </DashboardCard>
  );
}

/** The latest evaluations regardless of decision. Shares its query with the score distribution. */
export function RecentActivityCard() {
  const query = useRecentEvaluations();

  return (
    <DashboardCard
      title="Recent activity"
      description="The newest gateway evaluations, across all agents."
      action={<ViewAllLink href="/activity" label="All activity" />}
    >
      {query.isPending ? (
        <SectionSkeleton label="Loading recent activity" rows={5} />
      ) : query.isError ? (
        <SectionError error={query.error} onRetry={() => void query.refetch()} subject="recent activity" />
      ) : query.data.content.length === 0 ? (
        <SectionEmpty
          title="No runtime activity yet"
          body="Each request an agent makes through the gateway is recorded here, including denied and held requests."
        />
      ) : (
        <ul className="flex flex-col divide-y">
          {query.data.content.slice(0, RECENT_ACTIVITY_LIMIT).map((event) => (
            <ActivityRow key={event.id} event={event} />
          ))}
        </ul>
      )}
    </DashboardCard>
  );
}

function ViewAllLink({ href, label }: { href: string; label: string }) {
  return (
    <Button asChild variant="ghost" size="sm" className="shrink-0">
      <Link href={href}>
        {label}
        <ArrowRight aria-hidden="true" />
      </Link>
    </Button>
  );
}

function IncidentRow({ event }: { event: AuditLogResponse }) {
  return (
    <li>
      <Link
        href={`/activity?request=${event.requestId}`}
        className="flex flex-col gap-1.5 rounded-md py-3 transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
      >
        <div className="flex items-center justify-between gap-3">
          <DecisionBadge decision={event.decision} />
          <time dateTime={event.timestamp} className="font-mono text-xs tabular-nums text-muted-foreground">
            {formatTimestamp(event.timestamp)}
          </time>
        </div>
        <p className="truncate text-sm">
          <span className="font-mono text-xs">{event.agentId}</span>
          <span className="text-muted-foreground"> · {ACTION_LABELS[event.action]} </span>
          <span className="font-mono text-xs">{event.resource}</span>
        </p>
        <p className="line-clamp-2 text-xs text-muted-foreground">
          {AUTHORIZATION_LABELS[event.authorizationResult]}. {event.reason}
        </p>
      </Link>
    </li>
  );
}

function ActivityRow({ event }: { event: AuditLogResponse }) {
  return (
    // Below sm the badge and time share a top row and the text gets the full width, so long
    // resources are not squeezed. From sm up everything sits on one line.
    <li className="flex flex-col gap-1.5 py-2.5 sm:flex-row sm:items-center sm:gap-3">
      <div className="flex items-center justify-between gap-3 sm:contents">
        <DecisionBadge decision={event.decision} className="shrink-0" />
        <time
          dateTime={event.timestamp}
          className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground sm:order-last"
        >
          {formatTimestamp(event.timestamp)}
        </time>
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm">
          {ACTION_LABELS[event.action]} <span className="font-mono text-xs text-muted-foreground">{event.resource}</span>
        </p>
        <p className="truncate font-mono text-xs text-muted-foreground">{event.agentId}</p>
      </div>
    </li>
  );
}
