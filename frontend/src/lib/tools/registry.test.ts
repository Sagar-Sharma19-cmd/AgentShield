import { describe, expect, it } from "vitest";
import { countToolsByStatus, matchesToolSearch, visibleTools } from "./registry";

const tool = (id: string, name: string, status: "ACTIVE" | "DISABLED", description: string | null = null) => ({
  id,
  name,
  status,
  description,
});

const TOOLS = [
  tool("3", "shell", "DISABLED", "Runs build steps"),
  tool("1", "github", "ACTIVE", "Source control"),
  tool("2", "filesystem", "ACTIVE"),
];

describe("visibleTools", () => {
  it("sorts by name and filters by status", () => {
    expect(visibleTools(TOOLS, { search: "", status: "ALL" }).map((item) => item.name)).toEqual(["filesystem", "github", "shell"]);
    expect(visibleTools(TOOLS, { search: "", status: "DISABLED" }).map((item) => item.name)).toEqual(["shell"]);
  });

  it("searches name and description case-insensitively", () => {
    expect(visibleTools(TOOLS, { search: "  BUILD ", status: "ALL" }).map((item) => item.name)).toEqual(["shell"]);
    expect(visibleTools(TOOLS, { search: "git", status: "ACTIVE" }).map((item) => item.name)).toEqual(["github"]);
    expect(visibleTools(TOOLS, { search: "git", status: "DISABLED" })).toEqual([]);
  });

  it("does not change the input", () => {
    const copy = [...TOOLS];
    visibleTools(TOOLS, { search: "", status: "ALL" });
    expect(TOOLS).toEqual(copy);
  });
});

describe("matchesToolSearch", () => {
  it("treats whitespace as no search and never matches a null description", () => {
    expect(matchesToolSearch({ name: "fs", description: null }, "   ")).toBe(true);
    expect(matchesToolSearch({ name: "fs", description: null }, "null")).toBe(false);
  });
});

describe("countToolsByStatus", () => {
  it("counts the whole registry", () => {
    expect(countToolsByStatus(TOOLS)).toEqual({ ALL: 3, ACTIVE: 2, DISABLED: 1 });
  });
});
