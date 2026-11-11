/**
 * View logic for the Tools registry: status filter, search and order. Pure; tested in registry.test.ts.
 * "ALL" is a view filter only, not a tool status.
 */
import type { ToolResponse, ToolStatus } from "@/types/api";

export const TOOL_STATUS_FILTERS = ["ALL", "ACTIVE", "DISABLED"] as const satisfies readonly (ToolStatus | "ALL")[];
export type ToolStatusFilter = (typeof TOOL_STATUS_FILTERS)[number];

export const TOOL_STATUS_FILTER_LABELS: Record<ToolStatusFilter, string> = {
  ALL: "All",
  ACTIVE: "Active",
  DISABLED: "Disabled",
};

/** Matches name or description, case-insensitively. Whitespace-only search matches everything. */
export function matchesToolSearch(tool: Pick<ToolResponse, "name" | "description">, search: string): boolean {
  const needle = search.trim().toLowerCase();
  if (needle === "") return true;
  return tool.name.toLowerCase().includes(needle) || (tool.description ?? "").toLowerCase().includes(needle);
}

function compareText(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

/** Filtered by status and search, sorted by name then id (code-unit order, not locale-dependent). */
export function visibleTools<T extends Pick<ToolResponse, "id" | "name" | "description" | "status">>(
  tools: readonly T[],
  { search, status }: { search: string; status: ToolStatusFilter },
): T[] {
  return tools
    .filter((tool) => (status === "ALL" || tool.status === status) && matchesToolSearch(tool, search))
    .sort((a, b) => compareText(a.name, b.name) || compareText(a.id, b.id));
}

/** Counts over the whole registry, so the filter shows what exists. */
export function countToolsByStatus(tools: readonly Pick<ToolResponse, "status">[]): Record<ToolStatusFilter, number> {
  const counts: Record<ToolStatusFilter, number> = { ALL: tools.length, ACTIVE: 0, DISABLED: 0 };
  for (const tool of tools) counts[tool.status] += 1;
  return counts;
}
