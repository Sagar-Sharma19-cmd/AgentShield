/**
 * Pure helpers for the Activity table: filter chips, the client-side gate filter, relative time and
 * keyboard shortcuts. No React. Tested in table-model.test.ts.
 */
import { formatDistanceStrict, isValid, parseISO } from "date-fns";
import { GATES, gateFor, type Gate, type GateInput } from "@/lib/checkpoint/gates";
import { AUTHORIZATION_LABELS, DECISION_LABELS } from "@/lib/labels";
import { formatTimestamp } from "@/lib/format";
import type { ActivityFilters } from "./filters";

/* ---------------------------------------------------------------------------------------------- */
/* Filter chips (server filters, from the URL)                                                     */
/* ---------------------------------------------------------------------------------------------- */

export type FilterKey = keyof ActivityFilters;

export interface FilterChip {
  key: FilterKey;
  label: string;
  value: string;
}

const CHIP_ORDER: readonly FilterKey[] = ["agentId", "decision", "authorizationResult", "from", "to"];

/** One removable chip per applied filter, in a fixed order. Values are display text. */
export function activeFilterChips(filters: ActivityFilters): FilterChip[] {
  const chips: FilterChip[] = [];
  for (const key of CHIP_ORDER) {
    const raw = filters[key];
    if (raw === undefined) continue;
    switch (key) {
      case "agentId":
        chips.push({ key, label: "Agent", value: raw });
        break;
      case "decision":
        chips.push({ key, label: "Decision", value: DECISION_LABELS[raw as keyof typeof DECISION_LABELS] });
        break;
      case "authorizationResult":
        chips.push({ key, label: "Authorization", value: AUTHORIZATION_LABELS[raw as keyof typeof AUTHORIZATION_LABELS] });
        break;
      case "from":
        chips.push({ key, label: "From", value: formatTimestamp(raw) });
        break;
      case "to":
        chips.push({ key, label: "To", value: formatTimestamp(raw) });
        break;
    }
  }
  return chips;
}

/** The same filters with one removed. Paging is not part of ActivityFilters, so the caller restarts at page 1. */
export function withoutFilter(filters: ActivityFilters, key: FilterKey): ActivityFilters {
  const next = { ...filters };
  delete next[key];
  return next;
}

/* ---------------------------------------------------------------------------------------------- */
/* Gate filter (client-side, current page only)                                                    */
/* ---------------------------------------------------------------------------------------------- */

/** How many rows of the current page stopped at each gate. Every gate is present (0 when unused). */
export function gateCounts(rows: readonly GateInput[]): Record<Gate, number> {
  const counts = Object.fromEntries(GATES.map((gate) => [gate, 0])) as Record<Gate, number>;
  for (const row of rows) counts[gateFor(row)] += 1;
  return counts;
}

/** Rows of the current page decided at `gate`; all rows when gate is null. Order is preserved. */
export function filterByGate<T extends GateInput>(rows: readonly T[], gate: Gate | null): T[] {
  return gate === null ? [...rows] : rows.filter((row) => gateFor(row) === gate);
}

/* ---------------------------------------------------------------------------------------------- */
/* Time                                                                                            */
/* ---------------------------------------------------------------------------------------------- */

/** "3 minutes ago", or the raw value if it is not a valid instant. "just now" under 10 seconds. */
export function relativeTime(iso: string, now: number): string {
  const date = parseISO(iso);
  if (!isValid(date)) return iso;
  if (Math.abs(now - date.getTime()) < 10_000) return "just now";
  return formatDistanceStrict(date, now, { addSuffix: true });
}

/* ---------------------------------------------------------------------------------------------- */
/* Keyboard                                                                                        */
/* ---------------------------------------------------------------------------------------------- */

export interface KeyTarget {
  tagName: string;
  isContentEditable: boolean;
  /** Present for <input>: buttons and checkboxes are not text entry. */
  type?: string;
  /** ARIA role, for widgets such as comboboxes that are typed into without being inputs. */
  role?: string | null;
}

const NON_TEXT_INPUT_TYPES = new Set(["button", "checkbox", "radio", "submit", "reset", "range", "color", "file", "image"]);

/** True when a key press should go to the element instead of a page shortcut. */
export function isTypingTarget(target: KeyTarget | null): boolean {
  if (!target) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName.toUpperCase();
  if (tag === "TEXTAREA" || tag === "SELECT") return true;
  if (tag === "INPUT") return !NON_TEXT_INPUT_TYPES.has((target.type ?? "text").toLowerCase());
  return target.role === "combobox" || target.role === "textbox" || target.role === "listbox";
}

export type ActivityKeyResult =
  | { kind: "move"; index: number }
  | { kind: "open"; index: number }
  | { kind: "focus-filter" }
  | { kind: "none" };

export interface ActivityKeyEvent {
  key: string;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
}

export interface ActivityKeyContext {
  rowCount: number;
  /** Index of the highlighted row, or -1 when none is highlighted yet. */
  activeIndex: number;
  /** A dialog or sheet is open; page shortcuts stay out of its way (Esc is handled by the dialog). */
  dialogOpen: boolean;
  typing: boolean;
}

/**
 * J/K (and the arrow keys) move the highlighted row, Enter opens it, "/" focuses the agent filter.
 * Ignored while typing, while a dialog is open, and with Ctrl/⌘/Alt held.
 */
export function activityKey(event: ActivityKeyEvent, context: ActivityKeyContext): ActivityKeyResult {
  if (context.typing || context.dialogOpen || event.altKey || event.ctrlKey || event.metaKey) return { kind: "none" };
  const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
  if (key === "/") return { kind: "focus-filter" };
  if (context.rowCount <= 0) return { kind: "none" };

  const last = context.rowCount - 1;
  const current = Math.min(context.activeIndex, last);
  switch (key) {
    case "j":
      return { kind: "move", index: current < 0 ? 0 : Math.min(last, current + 1) };
    case "k":
      return { kind: "move", index: current < 0 ? 0 : Math.max(0, current - 1) };
    case "Enter":
      return current < 0 ? { kind: "none" } : { kind: "open", index: current };
    default:
      return { kind: "none" };
  }
}
