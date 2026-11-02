"use client";

import { RotateCw, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAdminKey } from "@/lib/auth/admin-key";
import { describeAgentRegistryError } from "@/lib/agents/model";

/**
 * Registry-specific failure panel. It mirrors the shared SectionError layout but takes its copy
 * from describeAgentRegistryError, so backend messages are never displayed here.
 */
export function AgentRegistryError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const { clearAdminKey } = useAdminKey();
  const copy = describeAgentRegistryError(error);

  return (
    <div role="alert" className="flex flex-1 flex-col gap-3 rounded-lg border border-danger/30 bg-danger/5 p-4">
      <div className="flex items-start gap-2.5">
        <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-danger-text" />
        <div className="flex flex-col gap-1">
          <p className="text-sm font-medium text-danger-text">{copy.title}</p>
          <p className="text-xs text-muted-foreground">{copy.body}</p>
        </div>
      </div>
      <div>
        {copy.action === "unlock" ? (
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
