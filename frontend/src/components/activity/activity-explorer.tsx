"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MicroLabel } from "@/components/checkpoint/checkpoint-panel";
import { Kbd } from "@/components/shell/command-palette";
import {
  buildActivityHref,
  hasActiveFilters,
  toAuditSearchParams,
  type ActivityFilters,
  type ActivityUrlState,
} from "@/lib/activity/filters";
import { activityKey, filterByGate, gateCounts, isTypingTarget, withoutFilter } from "@/lib/activity/table-model";
import { GATE_LABELS, type Gate } from "@/lib/checkpoint/gates";
import { useAuditList } from "@/lib/queries/audit";
import { ActiveFilterChips, GateChips } from "./activity-chips";
import { ActivityDetailSheet } from "./activity-detail-sheet";
import { ActivityFilters as ActivityFilterBar } from "./activity-filters";
import { ActivityList, type RowLayout } from "./activity-list";
import { ActivityPagination } from "./activity-pagination";
import { ActivityEmpty, ActivityError, ActivityLoading } from "./activity-states";

interface ActivityExplorerProps {
  /** Parsed from the page URL on the server. The URL is the single source of truth for filters, paging and selection. */
  state: ActivityUrlState;
}

/** Elements that handle Enter themselves; the page shortcut must not also fire. */
const NATIVE_ENTER_SELECTOR = "a[href], button, input, select, textarea, [role='button'], [role='link'], [role='option'], [role='menuitem']";
/** Inside these, page shortcuts stay out of the way. */
const OVERLAY_SELECTOR = "[role='dialog'], [role='alertdialog'], [role='listbox'], [role='menu']";

export function ActivityExplorer({ state }: ActivityExplorerProps) {
  const router = useRouter();
  const applied: ActivityFilters = {
    agentId: state.agentId,
    decision: state.decision,
    authorizationResult: state.authorizationResult,
    from: state.from,
    to: state.to,
  };
  const searchParams = toAuditSearchParams(state);
  const query = useAuditList(searchParams);
  const data = query.data;
  // keepPreviousData shows the last page's result while the next one loads. That result is not this page's, so it is not rendered.
  const isTransitioning = query.isPlaceholderData;
  const filtered = hasActiveFilters(applied);
  // A page can only be past the end when the filters still match events somewhere. Zero matches is a different state.
  const emptyReason = data && data.totalElements > 0 ? "page" : filtered ? "filtered" : "none";

  /** Identifies the server page on screen. Gate filter and keyboard position reset when it changes. */
  const pageKey = JSON.stringify(searchParams);
  const [gateState, setGateState] = useState<{ pageKey: string; gate: Gate | null }>({ pageKey, gate: null });
  const gate = gateState.pageKey === pageKey ? gateState.gate : null;
  const [activeState, setActiveState] = useState<{ key: string; index: number }>({ key: "", index: -1 });
  const viewKey = `${pageKey}|${gate ?? ""}`;
  const activeIndex = activeState.key === viewKey ? activeState.index : -1;

  const pageRows = !isTransitioning && data ? data.content : [];
  const rows = filterByGate(pageRows, gate);

  const agentInputRef = useRef<HTMLInputElement>(null);
  const rowButtons = useRef<Record<RowLayout, (HTMLButtonElement | null)[]>>({ table: [], list: [] });

  const registerRow = useCallback((layout: RowLayout, index: number, node: HTMLButtonElement | null) => {
    rowButtons.current[layout][index] = node;
  }, []);

  /** Every navigation is a URL change, so back/forward and shared links behave as expected. */
  const navigate = useCallback(
    (next: ActivityUrlState) => {
      router.push(buildActivityHref(next), { scroll: false });
    },
    [router],
  );

  function applyFilters(filters: ActivityFilters) {
    navigate({ ...filters });
  }

  function handlePageChange(nextPage: number) {
    navigate({ ...applied, page: nextPage });
  }

  function closeDetail() {
    navigate({ ...applied, page: state.page });
  }

  // Latest values for the keyboard handler, which is attached once.
  const keyContext = useRef({ rows, activeIndex, viewKey, sheetOpen: state.request !== undefined, applied, page: state.page });
  useEffect(() => {
    keyContext.current = { rows, activeIndex, viewKey, sheetOpen: state.request !== undefined, applied, page: state.page };
  });

  useEffect(() => {
    function focusRow(index: number) {
      const { table, list } = rowButtons.current;
      // Only one layout is visible at a time (md breakpoint); focus the one that is rendered on screen.
      const target = [table[index], list[index]].find((node) => node && node.getClientRects().length > 0);
      if (!target) return;
      target.focus({ preventScroll: true });
      target.scrollIntoView({ block: "nearest" });
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented) return;
      const element = event.target instanceof HTMLElement ? event.target : null;
      const context = keyContext.current;
      const result = activityKey(event, {
        rowCount: context.rows.length,
        activeIndex: context.activeIndex,
        dialogOpen: context.sheetOpen || Boolean(element?.closest(OVERLAY_SELECTOR)),
        typing: isTypingTarget(
          element
            ? {
                tagName: element.tagName,
                isContentEditable: element.isContentEditable,
                type: element instanceof HTMLInputElement ? element.type : undefined,
                role: element.getAttribute("role"),
              }
            : null,
        ),
      });

      switch (result.kind) {
        case "focus-filter":
          event.preventDefault();
          agentInputRef.current?.focus();
          agentInputRef.current?.select();
          return;
        case "move":
          event.preventDefault();
          setActiveState({ key: context.viewKey, index: result.index });
          focusRow(result.index);
          return;
        case "open": {
          // A focused row button already opens on Enter; do not open twice.
          if (element?.closest(NATIVE_ENTER_SELECTOR)) return;
          const row = context.rows[result.index];
          if (!row) return;
          event.preventDefault();
          navigate({ ...context.applied, page: context.page, request: row.requestId });
          return;
        }
        case "none":
          return;
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [navigate]);

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 p-4 md:p-8">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-1">
          <MicroLabel>Audit log</MicroLabel>
          <h1 className="font-heading text-2xl font-semibold tracking-tight">Activity</h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Every request an agent made through the gateway, the gate that decided it, and the reason AgentShield gave.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => query.refetch()}
          disabled={query.isFetching}
          aria-label="Refresh activity"
          className="self-start sm:self-end"
        >
          <RotateCw aria-hidden="true" className={query.isFetching ? "animate-spin motion-reduce:animate-none" : undefined} />
          Refresh
        </Button>
      </header>

      <ActivityFilterBar key={JSON.stringify(applied)} applied={applied} onApply={applyFilters} agentInputRef={agentInputRef} />

      <ActiveFilterChips
        filters={applied}
        onRemove={(key) => navigate({ ...withoutFilter(applied, key) })}
        onClearAll={() => navigate({})}
      />

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
        <div className="flex flex-col gap-3">
          <GateChips
            counts={gateCounts(data.content)}
            selected={gate}
            onSelect={(next) => setGateState({ pageKey, gate: next })}
            pageRows={data.content.length}
          />

          {rows.length === 0 && gate !== null ? (
            <p role="status" className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
              No rows on this page were decided at {GATE_LABELS[gate]}.
            </p>
          ) : (
            <ActivityList
              key={pageKey}
              events={rows}
              selectedRequestId={state.request}
              onSelect={(requestId) => navigate({ ...applied, page: state.page, request: requestId })}
              isUpdating={query.isFetching && !query.isPending}
              registerRow={registerRow}
              onRowFocus={(index) => setActiveState({ key: viewKey, index })}
            />
          )}

          <KeyboardHint />
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

/** Shortcut reminder for keyboard users. Hidden on small screens, where there is usually no keyboard. */
function KeyboardHint() {
  return (
    <p className="hidden flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground md:flex">
      <span className="inline-flex items-center gap-1">
        <Kbd>J</Kbd>
        <Kbd>K</Kbd> move
      </span>
      <span className="inline-flex items-center gap-1">
        <Kbd>Enter</Kbd> open
      </span>
      <span className="inline-flex items-center gap-1">
        <Kbd>Esc</Kbd> close
      </span>
      <span className="inline-flex items-center gap-1">
        <Kbd>/</Kbd> agent filter
      </span>
    </p>
  );
}
