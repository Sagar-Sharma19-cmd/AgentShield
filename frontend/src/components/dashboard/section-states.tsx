"use client";

import { useId } from "react";
import { Inbox, RotateCw, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError } from "@/lib/api/client";
import { useAdminKey } from "@/lib/auth/admin-key";
import { cn } from "@/lib/utils";

/** Titled panel shared by every dashboard section, so loading, empty and error states sit in the same frame. */
export function DashboardCard({
  title,
  description,
  action,
  className,
  children,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  const headingId = useId();

  return (
    <Card role="region" aria-labelledby={headingId} className={cn("h-full", className)}>
      <CardHeader>
        <div className="flex min-w-0 flex-col gap-1">
          <CardTitle id={headingId} className="text-sm font-medium">
            {title}
          </CardTitle>
          {description && <CardDescription>{description}</CardDescription>}
        </div>
        {action && <CardAction>{action}</CardAction>}
      </CardHeader>
      <CardContent className="flex flex-1 flex-col">{children}</CardContent>
    </Card>
  );
}

/** Placeholder rows that match the loaded layout, so content does not jump when data arrives. */
export function SectionSkeleton({ label, rows = 3 }: { label: string; rows?: number }) {
  return (
    <div className="flex flex-col gap-3" aria-busy="true" aria-label={label}>
      {Array.from({ length: rows }, (_, index) => (
        <Skeleton key={index} className="h-9 w-full" />
      ))}
    </div>
  );
}

export function SectionEmpty({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 rounded-lg border border-dashed bg-muted/40 px-4 py-8 text-center">
      <div className="flex size-9 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Inbox aria-hidden="true" className="size-4" />
      </div>
      <p className="text-sm font-medium">{title}</p>
      <p className="max-w-sm text-xs text-muted-foreground">{body}</p>
    </div>
  );
}

/**
 * Failure state for one section. A rejected admin key is the only failure that needs the operator
 * to act (lock and re-enter the key); everything else is offered a retry.
 */
export function SectionError({ error, onRetry, subject }: { error: Error; onRetry: () => void; subject: string }) {
  const { clearAdminKey } = useAdminKey();
  const rejected = error instanceof ApiError && (error.status === 401 || error.status === 403);

  return (
    <div role="alert" className="flex flex-1 flex-col gap-3 rounded-lg border border-danger/30 bg-danger/5 p-4">
      <div className="flex items-start gap-2.5">
        <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-danger-text" />
        <div className="flex flex-col gap-1">
          <p className="text-sm font-medium text-danger-text">
            {rejected ? "AgentShield rejected the admin key" : `Could not load ${subject}`}
          </p>
          <p className="text-xs text-muted-foreground">
            {rejected
              ? "The key may be wrong or revoked. Lock the console and unlock it with a valid admin key."
              : error instanceof ApiError
                ? error.message
                : "The AgentShield backend did not respond. Check that it is running."}
          </p>
        </div>
      </div>
      <div>
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
