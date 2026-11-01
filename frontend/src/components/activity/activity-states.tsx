"use client";

import { Inbox, RotateCw, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError } from "@/lib/api/client";
import { useAdminKey } from "@/lib/auth/admin-key";

/** Placeholder rows shaped like the loaded list, so the layout does not jump when data arrives. */
export function ActivityLoading() {
  return (
    <div className="flex flex-col gap-2" aria-busy="true" aria-label="Loading activity">
      {Array.from({ length: 8 }, (_, index) => (
        <div key={index} className="flex items-center gap-4 rounded-lg border bg-card px-4 py-3">
          <Skeleton className="h-5 w-24 rounded-md" />
          <Skeleton className="h-4 w-32" />
          <Skeleton className="hidden h-4 flex-1 md:block" />
          <Skeleton className="h-4 w-20" />
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
    <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed bg-card/60 px-6 py-12 text-center">
      <div className="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Inbox aria-hidden="true" className="size-5" />
      </div>
      <div className="flex max-w-md flex-col gap-1">
        <h2 className="text-base font-medium">{copy.title}</h2>
        <p className="text-sm text-muted-foreground">{copy.body}</p>
      </div>
      <Button variant="outline" size="sm" onClick={onAction}>
        {copy.action}
      </Button>
    </div>
  );
}

const EMPTY_COPY: Record<ActivityEmptyProps["reason"], { title: string; body: string; action: string }> = {
  none: {
    title: "No runtime activity yet",
    body: "Each request an agent makes through POST /api/v1/gateway/evaluate is audited here, including denied and held requests.",
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

  return (
    <div role="alert" className="flex flex-col gap-4 rounded-lg border border-danger/30 bg-danger/5 p-5">
      <div className="flex items-start gap-3">
        <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-danger-text" />
        <div className="flex flex-col gap-1">
          <h2 className="text-sm font-medium text-danger-text">
            {rejected ? "AgentShield rejected the admin key" : "Could not load runtime activity"}
          </h2>
          <p className="text-sm text-muted-foreground">
            {rejected
              ? "The key may be wrong or revoked. Lock the console and unlock it with a valid admin key."
              : describeError(error)}
          </p>
        </div>
      </div>
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
    </div>
  );
}

function describeError(error: Error): string {
  if (error instanceof ApiError) return error.message;
  return "The AgentShield backend did not respond. Check that it is running, then try again.";
}
