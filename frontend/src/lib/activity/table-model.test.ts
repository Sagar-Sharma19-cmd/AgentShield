import { describe, expect, it } from "vitest";
import type { GateInput } from "@/lib/checkpoint/gates";
import {
  activeFilterChips,
  activityKey,
  filterByGate,
  gateCounts,
  isTypingTarget,
  relativeTime,
  withoutFilter,
  type ActivityKeyContext,
  type ActivityKeyEvent,
} from "./table-model";

describe("activeFilterChips", () => {
  it("returns nothing when no filter is applied", () => {
    expect(activeFilterChips({})).toEqual([]);
  });

  it("returns one chip per applied filter, in a fixed order with display labels", () => {
    const chips = activeFilterChips({
      to: "2026-11-10T12:00:00.000Z",
      decision: "DENY",
      agentId: "ci-agent",
      authorizationResult: "UNAUTHORIZED",
    });
    expect(chips.map((chip) => chip.key)).toEqual(["agentId", "decision", "authorizationResult", "to"]);
    expect(chips[0]).toEqual({ key: "agentId", label: "Agent", value: "ci-agent" });
    expect(chips[1].value).toBe("Denied");
    expect(chips[2].label).toBe("Authorization");
    expect(chips[3].label).toBe("To");
  });
});

describe("withoutFilter", () => {
  it("removes only the given filter and does not mutate the input", () => {
    const filters = { agentId: "a", decision: "ALLOW" as const };
    expect(withoutFilter(filters, "agentId")).toEqual({ decision: "ALLOW" });
    expect(filters).toEqual({ agentId: "a", decision: "ALLOW" });
  });
});

const r = (authorizationResult: GateInput["authorizationResult"], decision: GateInput["decision"], escalatedBy: GateInput["escalatedBy"] = "NONE") => ({
  authorizationResult,
  decision,
  escalatedBy,
});

describe("gateCounts / filterByGate", () => {
  const rows = [
    r("AUTHORIZED", "ALLOW"),
    r("UNAUTHORIZED", "DENY"),
    r("AUTHORIZED", "DENY"),
    r("AUTHORIZED", "ALLOW"),
    r("AUTHORIZED", "REVIEW", "TRAJECTORY"),
  ];

  it("counts every gate, including zeros", () => {
    expect(gateCounts(rows)).toEqual({ IDENTITY: 0, PERMISSION: 1, POLICY: 1, RISK_ENGINE: 0, TRAJECTORY: 1, PASSED: 2 });
    expect(gateCounts([])).toEqual({ IDENTITY: 0, PERMISSION: 0, POLICY: 0, RISK_ENGINE: 0, TRAJECTORY: 0, PASSED: 0 });
  });

  it("filters to one gate and keeps the order; null keeps every row", () => {
    expect(filterByGate(rows, "PASSED")).toEqual([rows[0], rows[3]]);
    expect(filterByGate(rows, "IDENTITY")).toEqual([]);
    expect(filterByGate(rows, null)).toEqual(rows);
  });
});

describe("relativeTime", () => {
  const now = Date.parse("2026-11-10T12:00:00Z");

  it("describes the distance from now", () => {
    expect(relativeTime("2026-11-10T11:57:00Z", now)).toBe("3 minutes ago");
    expect(relativeTime("2026-11-09T12:00:00Z", now)).toBe("1 day ago");
  });

  it("says 'just now' within ten seconds", () => {
    expect(relativeTime("2026-11-10T11:59:55Z", now)).toBe("just now");
  });

  it("returns the raw value for an invalid instant", () => {
    expect(relativeTime("not-a-date", now)).toBe("not-a-date");
  });
});

describe("isTypingTarget", () => {
  it("treats text inputs, textareas, selects and editable content as typing", () => {
    expect(isTypingTarget({ tagName: "INPUT", isContentEditable: false, type: "text" })).toBe(true);
    expect(isTypingTarget({ tagName: "input", isContentEditable: false, type: "datetime-local" })).toBe(true);
    expect(isTypingTarget({ tagName: "INPUT", isContentEditable: false })).toBe(true);
    expect(isTypingTarget({ tagName: "TEXTAREA", isContentEditable: false })).toBe(true);
    expect(isTypingTarget({ tagName: "SELECT", isContentEditable: false })).toBe(true);
    expect(isTypingTarget({ tagName: "DIV", isContentEditable: true })).toBe(true);
    expect(isTypingTarget({ tagName: "BUTTON", isContentEditable: false, role: "combobox" })).toBe(true);
  });

  it("does not treat buttons, checkboxes, links or no target as typing", () => {
    expect(isTypingTarget({ tagName: "BUTTON", isContentEditable: false })).toBe(false);
    expect(isTypingTarget({ tagName: "INPUT", isContentEditable: false, type: "checkbox" })).toBe(false);
    expect(isTypingTarget({ tagName: "A", isContentEditable: false, role: null })).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
  });
});

describe("activityKey", () => {
  const press = (key: string, mods: Partial<ActivityKeyEvent> = {}): ActivityKeyEvent => ({
    key,
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    ...mods,
  });
  const ctx = (overrides: Partial<ActivityKeyContext> = {}): ActivityKeyContext => ({
    rowCount: 5,
    activeIndex: 2,
    dialogOpen: false,
    typing: false,
    ...overrides,
  });

  it("moves with J/K, clamped to the rows", () => {
    expect(activityKey(press("j"), ctx())).toEqual({ kind: "move", index: 3 });
    expect(activityKey(press("K"), ctx())).toEqual({ kind: "move", index: 1 });
    expect(activityKey(press("j"), ctx({ activeIndex: 4 }))).toEqual({ kind: "move", index: 4 });
    expect(activityKey(press("k"), ctx({ activeIndex: 0 }))).toEqual({ kind: "move", index: 0 });
  });

  it("starts at the first row when nothing is highlighted", () => {
    expect(activityKey(press("j"), ctx({ activeIndex: -1 }))).toEqual({ kind: "move", index: 0 });
    expect(activityKey(press("k"), ctx({ activeIndex: -1 }))).toEqual({ kind: "move", index: 0 });
    expect(activityKey(press("Enter"), ctx({ activeIndex: -1 }))).toEqual({ kind: "none" });
  });

  it("opens the highlighted row with Enter, clamping a stale index", () => {
    expect(activityKey(press("Enter"), ctx())).toEqual({ kind: "open", index: 2 });
    expect(activityKey(press("Enter"), ctx({ activeIndex: 9 }))).toEqual({ kind: "open", index: 4 });
  });

  it("focuses the agent filter with /, even with no rows", () => {
    expect(activityKey(press("/"), ctx({ rowCount: 0 }))).toEqual({ kind: "focus-filter" });
  });

  it("ignores keys while typing, with a dialog open, with modifiers, or with no rows", () => {
    expect(activityKey(press("j"), ctx({ typing: true }))).toEqual({ kind: "none" });
    expect(activityKey(press("/"), ctx({ typing: true }))).toEqual({ kind: "none" });
    expect(activityKey(press("j"), ctx({ dialogOpen: true }))).toEqual({ kind: "none" });
    expect(activityKey(press("k", { metaKey: true }), ctx())).toEqual({ kind: "none" });
    expect(activityKey(press("j", { ctrlKey: true }), ctx())).toEqual({ kind: "none" });
    expect(activityKey(press("j"), ctx({ rowCount: 0 }))).toEqual({ kind: "none" });
    expect(activityKey(press("x"), ctx())).toEqual({ kind: "none" });
  });
});
