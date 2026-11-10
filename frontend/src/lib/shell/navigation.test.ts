import { describe, expect, it } from "vitest";
import { badgeCountLabel, breadcrumbsFor, isNavActive, NAV_GROUPS, NAV_ITEMS, navSections } from "./navigation";

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

describe("navigation groups", () => {
  it("assigns every page to the agreed group", () => {
    const groupOf = Object.fromEntries(NAV_ITEMS.map((item) => [item.label, item.group]));
    expect(groupOf).toEqual({
      Overview: "monitor",
      Activity: "monitor",
      Reviews: "respond",
      Agents: "configure",
      Tools: "configure",
      "CI/CD demo": "demo",
    });
  });

  it("only uses groups that exist in NAV_GROUPS", () => {
    const known = new Set(NAV_GROUPS.map((group) => group.id));
    for (const item of NAV_ITEMS) expect(known.has(item.group)).toBe(true);
  });

  it("has unique hrefs", () => {
    const hrefs = NAV_ITEMS.map((item) => item.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });
});

describe("navSections", () => {
  it("orders sections by NAV_GROUPS and keeps item order within each", () => {
    expect(navSections().map((section) => [section.label, section.items.map((item) => item.label)])).toEqual([
      ["Monitor", ["Overview", "Activity"]],
      ["Respond", ["Reviews"]],
      ["Configure", ["Agents", "Tools"]],
      ["Demo", ["CI/CD demo"]],
    ]);
  });

  it("includes every nav item exactly once", () => {
    const flattened = navSections().flatMap((section) => section.items);
    expect(flattened).toHaveLength(NAV_ITEMS.length);
    expect(new Set(flattened)).toEqual(new Set(NAV_ITEMS));
  });

  it("omits groups with no items", () => {
    const onlyMonitor = NAV_ITEMS.filter((item) => item.group === "monitor");
    expect(navSections(onlyMonitor).map((section) => section.id)).toEqual(["monitor"]);
  });
});

describe("badgeCountLabel", () => {
  it("shows nothing for zero, negative, missing or invalid counts", () => {
    expect(badgeCountLabel(undefined)).toBeNull();
    expect(badgeCountLabel(0)).toBeNull();
    expect(badgeCountLabel(-2)).toBeNull();
    expect(badgeCountLabel(Number.NaN)).toBeNull();
  });

  it("shows the count up to 99, then 99+", () => {
    expect(badgeCountLabel(1)).toBe("1");
    expect(badgeCountLabel(99)).toBe("99");
    expect(badgeCountLabel(100)).toBe("99+");
  });
});
