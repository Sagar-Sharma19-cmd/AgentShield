"use client";

import { SessionTraceChart } from "@/components/checkpoint/session-trace";
import { Skeleton } from "@/components/ui/skeleton";
import { sessionTrace } from "@/lib/checkpoint/gates";
import { AGENT_SAMPLE_SIZE, useAgentAuditSample } from "@/lib/queries/audit";
import type { AuditLogResponse } from "@/types/api";
import { ActivityError } from "./activity-states";

/**
 * Where this request sits in its session. There is no per-session audit endpoint, so this reads the
 * agent's latest AGENT_SAMPLE_SIZE requests and keeps the ones from the same session. Older requests
 * of the session are not shown, and the copy says so.
 */
export function SessionContext({ event }: { event: AuditLogResponse }) {
  const query = useAgentAuditSample(event.agentId);
  const scope = (
    <p className="text-xs text-muted-foreground">
      Taken from the latest {AGENT_SAMPLE_SIZE} requests of agent <span className="font-mono">{event.agentId}</span>. Earlier
      requests in this session are not shown.
    </p>
  );

  if (query.isPending) {
    return <Skeleton aria-busy="true" aria-label="Loading session context" className="h-56 w-full" />;
  }
  if (query.isError) {
    return <ActivityError error={query.error} onRetry={() => void query.refetch()} />;
  }

  const points = sessionTrace(query.data.content, event.sessionId);
  const included = points.some((point) => point.requestId === event.requestId);
  const scores = points.flatMap((point) => (point.trajectoryScore === null ? [] : [point.trajectoryScore]));
  const peakScore = scores.length > 0 ? Math.max(...scores) : null;

  if (!included) {
    return (
      <div className="flex flex-col gap-2 rounded-lg border border-dashed border-border px-3 py-4">
        <p className="text-sm">This request is older than the agent&apos;s latest {AGENT_SAMPLE_SIZE} requests.</p>
        {scope}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">
        {points.length === 1
          ? "This is the only request of its session in the sample."
          : `${points.length} requests of this session, oldest first. This request is ringed.`}
      </p>
      <SessionTraceChart
        sessionId={event.sessionId}
        agentId={event.agentId}
        peakScore={peakScore}
        points={points}
        highlightRequestId={event.requestId}
      />
      {scope}
    </div>
  );
}
