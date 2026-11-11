"use client";

import { RotateCw, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAdminKey } from "@/lib/auth/admin-key";
import type { AgentLoadErrorCopy } from "@/lib/agents/detail-model";

/**
 * Failure panel for any agent request. The caller supplies copy from a describe* helper, so backend
 * messages never reach this component. Layout matches the shared SectionError.
 */
export function AgentLoadError({ copy, onRetry }: { copy: AgentLoadErrorCopy; onRetry: () => void }) {
  const { clearAdminKey } = useAdminKey();

  return (
    <div role="status" className="flex flex-col gap-3 rounded-lg border border-danger/30 bg-danger/5 p-4">
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
