import { describe, expect, it } from "vitest";
import { breadcrumbsFor, isNavActive } from "./navigation";

describe("isNavActive", () => {
  it("matches the overview only on the exact root path", () => {
    expect(isNavActive("/", "/")).toBe(true);
    expect(isNavActive("/agents", "/")).toBe(false);
  });

  it("matches a section on its path and sub-paths, but not on a longer sibling name", () => {
    expect(isNavActive("/agents", "/agents")).toBe(true);
    expect(isNavActive("/agents/abc", "/agents")).toBe(true);
    expect(isNavActive("/agentsX", "/agents")).toBe(false);
  });
});

describe("breadcrumbsFor", () => {
  it("returns the overview crumb for the root", () => {
    expect(breadcrumbsFor("/")).toEqual([{ label: "Console" }, { label: "Overview" }]);
  });

  it("links the console root for a section page", () => {
    expect(breadcrumbsFor("/tools")).toEqual([{ label: "Console", href: "/" }, { label: "Tools" }]);
  });

  it("falls back to the console root for an unknown path", () => {
    expect(breadcrumbsFor("/nope")).toEqual([{ label: "Console" }, { label: "Overview" }]);
  });
});
