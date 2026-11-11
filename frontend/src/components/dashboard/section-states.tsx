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
  id,
  focusable = false,
  children,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
  /** Anchor id, for a card that is a link target (e.g. the alert feed). */
  id?: string;
  /** Lets a link move focus to the card itself (tabIndex -1, not in the tab order), with a visible ring. */
  focusable?: boolean;
  children: React.ReactNode;
}) {
  const headingId = useId();

  return (
    <Card
      id={id}
      role="region"
      aria-labelledby={headingId}
      tabIndex={focusable ? -1 : undefined}
      className={cn("h-full", focusable && "scroll-mt-20 outline-none focus:ring-3 focus:ring-ring/50", className)}
    >
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

/**
 * The console's one empty state. `titleAs="h2"` when it stands in for a page's main content (not inside a
 * card); `action` is its recovery button; `children` adds a short hint under the body.
 */
export function SectionEmpty({
  title,
  body,
  action,
  titleAs: Title = "p",
  children,
}: {
  title: string;
  body: string;
  action?: React.ReactNode;
  titleAs?: "p" | "h2";
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 rounded-lg border border-dashed bg-muted/40 px-4 py-8 text-center">
      <div className="flex size-9 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Inbox aria-hidden="true" className="size-4" />
      </div>
      <Title className="text-sm font-medium">{title}</Title>
      <p className="max-w-sm text-xs text-muted-foreground">{body}</p>
      {children ? <div className="max-w-sm text-xs text-muted-foreground">{children}</div> : null}
      {action ? <div className="mt-1">{action}</div> : null}
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
    <div role="status" className="flex flex-1 flex-col gap-3 rounded-lg border border-danger/30 bg-danger/5 p-4">
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
