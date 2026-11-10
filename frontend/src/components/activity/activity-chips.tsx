"use client";

import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GateIcon } from "@/components/checkpoint/gate-mark";
import { activeFilterChips, type FilterKey } from "@/lib/activity/table-model";
import type { ActivityFilters } from "@/lib/activity/filters";
import { GATE_LABELS, GATES, type Gate } from "@/lib/checkpoint/gates";
import { cn } from "@/lib/utils";

/** Applied (URL) filters as removable chips, plus "Clear all". Renders nothing when no filter is applied. */
export function ActiveFilterChips({
  filters,
  onRemove,
  onClearAll,
}: {
  filters: ActivityFilters;
  onRemove: (key: FilterKey) => void;
  onClearAll: () => void;
}) {
  const chips = activeFilterChips(filters);
  if (chips.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs text-muted-foreground">Filtered by</span>
      <ul className="flex flex-wrap items-center gap-1.5" aria-label="Applied filters">
        {chips.map((chip) => (
          <li key={chip.key}>
            <span className="inline-flex h-7 items-center gap-1 rounded-md border border-border bg-card pr-0.5 pl-2 text-xs">
              <span className="text-muted-foreground">{chip.label}:</span>
              <span className={cn("max-w-48 truncate", chip.key === "agentId" && "font-mono")} title={chip.value}>
                {chip.value}
              </span>
              <button
                type="button"
                onClick={() => onRemove(chip.key)}
                aria-label={`Remove filter ${chip.label}: ${chip.value}`}
                className="ml-0.5 inline-flex size-6 items-center justify-center rounded-sm text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
              >
                <X aria-hidden="true" className="size-3.5" />
              </button>
            </span>
          </li>
        ))}
      </ul>
      <Button variant="ghost" size="sm" onClick={onClearAll} className="h-7 px-2 text-xs">
        Clear all
      </Button>
    </div>
  );
}

/**
 * Narrow the CURRENT page to one deciding gate. This is a client-side view of the rows already
 * loaded; it does not query the server or change the URL, and the copy says so.
 */
export function GateChips({
  counts,
  selected,
  onSelect,
  pageRows,
}: {
  counts: Record<Gate, number>;
  selected: Gate | null;
  onSelect: (gate: Gate | null) => void;
  pageRows: number;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div role="group" aria-label="Show rows of this page decided at a gate" className="flex flex-wrap items-center gap-1.5">
        <GateChip pressed={selected === null} onClick={() => onSelect(null)} label="All gates" count={pageRows} />
        {GATES.map((gate) => (
          <GateChip
            key={gate}
            pressed={selected === gate}
            onClick={() => onSelect(selected === gate ? null : gate)}
            label={GATE_LABELS[gate]}
            count={counts[gate]}
            gate={gate}
            disabled={counts[gate] === 0 && selected !== gate}
          />
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        Gate chips filter only the {pageRows} rows on this page, not the full history.
      </p>
    </div>
  );
}

function GateChip({
  pressed,
  onClick,
  label,
  count,
  gate,
  disabled = false,
}: {
  pressed: boolean;
  onClick: () => void;
  label: string;
  count: number;
  gate?: Gate;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "inline-flex h-7 items-center gap-1.5 rounded-md border px-2 text-xs outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none",
        pressed
          ? "border-foreground/60 bg-foreground text-background"
          : "border-border bg-card text-foreground hover:bg-muted",
      )}
    >
      {gate ? <GateIcon gate={gate} className={pressed ? "text-background" : "text-muted-foreground"} /> : null}
      {label}
      <span className={cn("font-mono tabular-nums", pressed ? "text-background/80" : "text-muted-foreground")}>{count}</span>
    </button>
  );
}
