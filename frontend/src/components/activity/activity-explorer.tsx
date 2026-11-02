"use client";

import { useRouter } from "next/navigation";
import { RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  buildActivityHref,
  hasActiveFilters,
  toAuditSearchParams,
  type ActivityFilters,
  type ActivityUrlState,
} from "@/lib/activity/filters";
import { useAuditList } from "@/lib/queries/audit";
import { ActivityDetailSheet } from "./activity-detail-sheet";
import { ActivityFilters as ActivityFilterBar } from "./activity-filters";
import { ActivityList } from "./activity-list";
import { ActivityPagination } from "./activity-pagination";
import { ActivityEmpty, ActivityError, ActivityLoading } from "./activity-states";

interface ActivityExplorerProps {
  /** Parsed from the page URL on the server. The URL is the single source of truth for filters, paging and selection. */
  state: ActivityUrlState;
}

export function ActivityExplorer({ state }: ActivityExplorerProps) {
  const router = useRouter();
  const applied: ActivityFilters = {
    agentId: state.agentId,
    decision: state.decision,
    authorizationResult: state.authorizationResult,
    from: state.from,
    to: state.to,
  };
  const query = useAuditList(toAuditSearchParams(state));
  const data = query.data;
  // keepPreviousData shows the last page's result while the next one loads. That result is not this page's, so it is not rendered.
  const isTransitioning = query.isPlaceholderData;
  const filtered = hasActiveFilters(applied);
  // A page can only be past the end when the filters still match events somewhere. Zero matches is a different state.
  const emptyReason = data && data.totalElements > 0 ? "page" : filtered ? "filtered" : "none";

  /** Every navigation is a URL change, so back/forward and shared links behave as expected. */
  function navigate(next: ActivityUrlState) {
    router.push(buildActivityHref(next), { scroll: false });
  }

  function applyFilters(filters: ActivityFilters) {
    navigate({ ...filters });
  }

  function handlePageChange(nextPage: number) {
    navigate({ ...applied, page: nextPage });
  }

  function closeDetail() {
    navigate({ ...applied, page: state.page });
  }

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 p-4 md:p-8">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-semibold tracking-tight">Activity</h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            The runtime security stream: every request an agent makes through the gateway, the decision
            AgentShield reached, and the reason it gave.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => query.refetch()}
          disabled={query.isFetching}
          aria-label="Refresh activity"
          className="self-start"
        >
          <RotateCw
            aria-hidden="true"
            className={query.isFetching ? "animate-spin motion-reduce:animate-none" : undefined}
          />
          Refresh
        </Button>
      </header>

      <ActivityFilterBar key={JSON.stringify(applied)} applied={applied} onApply={applyFilters} />

      {(query.isPending || isTransitioning) && <ActivityLoading />}

      {query.isError && <ActivityError error={query.error} onRetry={() => query.refetch()} />}

      {!isTransitioning && data && data.content.length === 0 && (
        <ActivityEmpty
          reason={emptyReason}
          onAction={() => {
            if (emptyReason === "page") navigate({ ...applied });
            else if (emptyReason === "filtered") navigate({});
            else query.refetch();
          }}
        />
      )}

      {!isTransitioning && data && data.content.length > 0 && (
        <div className="flex flex-col gap-4">
          <ActivityList
            events={data.content}
            selectedRequestId={state.request}
            onSelect={(requestId) => navigate({ ...applied, page: state.page, request: requestId })}
            isUpdating={query.isFetching && !query.isPending}
          />
          <ActivityPagination
            page={data.page}
            totalPages={data.totalPages}
            totalElements={data.totalElements}
            pageSize={data.size}
            onPageChange={handlePageChange}
          />
        </div>
      )}

      <ActivityDetailSheet requestId={state.request} onClose={closeDetail} />
    </div>
  );
}
