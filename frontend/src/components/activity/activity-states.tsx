"use client";

import { RotateCw, TriangleAlert } from "lucide-react";
import { SectionEmpty } from "@/components/dashboard/section-states";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError } from "@/lib/api/client";
import { useAdminKey } from "@/lib/auth/admin-key";

/** Placeholder rows shaped like the loaded table, so the layout does not jump when data arrives. */
export function ActivityLoading() {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card" aria-busy="true" aria-label="Loading activity">
      <div className="hidden h-9 items-center gap-4 border-b border-border px-3 md:flex">
        {[16, 20, 16, 12, 28, 14, 16].map((width, index) => (
          <Skeleton key={index} className="h-2.5" style={{ width: `${width}%` }} />
        ))}
      </div>
      {Array.from({ length: 10 }, (_, index) => (
        <div key={index} className="flex h-10 items-center gap-4 border-b border-border/60 px-3 last:border-b-0">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-3 w-28" />
          <Skeleton className="hidden h-3 w-24 md:block" />
          <Skeleton className="hidden h-3 flex-1 md:block" />
          <Skeleton className="h-3 w-20" />
          <Skeleton className="ml-auto h-3 w-8" />
        </div>
      ))}
    </div>
  );
}

interface ActivityEmptyProps {
  /** `none`: nothing recorded yet. `filtered`: nothing matches the active filters. `page`: requested page is past the end. */
  reason: "none" | "filtered" | "page";
  /** Each reason has its own recovery action; the caller decides what it does. */
  onAction: () => void;
}

export function ActivityEmpty({ reason, onAction }: ActivityEmptyProps) {
  const copy = EMPTY_COPY[reason];

  return (
    <SectionEmpty
      titleAs="h2"
      title={copy.title}
      body={copy.body}
      action={
        <Button variant="outline" size="sm" onClick={onAction}>
          {copy.action}
        </Button>
      }
    >
      {reason === "none" ? (
        <>
          To generate sample traffic, run <code className="rounded bg-muted px-1 py-0.5 font-mono">scripts/demo.sh</code> from
          the repository root (see docs/demo-guide.md).
        </>
      ) : null}
    </SectionEmpty>
  );
}

const EMPTY_COPY: Record<ActivityEmptyProps["reason"], { title: string; body: string; action: string }> = {
  none: {
    title: "No runtime activity yet",
    body: "Each request an agent makes through the AgentShield gateway is recorded here, including denied and held requests.",
    action: "Refresh",
  },
  filtered: {
    title: "No events match these filters",
    body: "Widen the time range, or remove the agent and decision filters.",
    action: "Clear filters",
  },
  page: {
    title: "This page is past the last result",
    body: "The filters still match events, but this page number is beyond them.",
    action: "Back to first page",
  },
};

interface ActivityErrorProps {
  error: Error;
  onRetry: () => void;
}

export function ActivityError({ error, onRetry }: ActivityErrorProps) {
  const { clearAdminKey } = useAdminKey();
  const rejected = error instanceof ApiError && (error.status === 401 || error.status === 403);
  // A 404 means the record does not exist. Retrying cannot change that, so no retry action is offered.
  const notFound = error instanceof ApiError && error.status === 404;

  return (
    <div role="status" className="flex flex-col gap-4 rounded-lg border border-danger/30 bg-danger/5 p-5">
      <div className="flex items-start gap-3">
        <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-danger-text" />
        <div className="flex flex-col gap-1">
          <h2 className="text-sm font-medium text-danger-text">{errorTitle(rejected, notFound)}</h2>
          <p className="text-sm text-muted-foreground">
            {rejected
              ? "The key may be wrong or revoked. Lock the console and unlock it with a valid admin key."
              : notFound
                ? "No audit event matches this request ID. Close this panel and choose another event."
                : describeError(error)}
          </p>
        </div>
      </div>
      {!notFound && (
        <div className="flex gap-2">
          {rejected ? (
            <Button variant="outline" size="sm" onClick={clearAdminKey}>
              Lock console
            </Button>
          ) : (
            <Button variant="outline" size="sm" onClick={onRetry}>
              <RotateCw aria-hidden="true" />
              Try again
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

function errorTitle(rejected: boolean, notFound: boolean): string {
  if (rejected) return "AgentShield rejected the admin key";
  if (notFound) return "Audit event not found";
  return "Could not load runtime activity";
}

function describeError(error: Error): string {
  if (error instanceof ApiError) return error.message;
  return "The AgentShield backend did not respond. Check that it is running, then try again.";
}
