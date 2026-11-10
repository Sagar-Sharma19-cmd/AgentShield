import { describe, expect, it } from "vitest";
import {
  buildCommands,
  COMMAND_GROUPS,
  groupCommands,
  isApplePlatform,
  isPaletteShortcut,
  paletteAriaShortcut,
  paletteShortcutLabel,
  type CommandContext,
  type ShortcutKeyEvent,
} from "./commands";
import { isNavActive, NAV_ITEMS } from "./navigation";

function context(overrides: Partial<CommandContext> = {}): CommandContext {
  return {
    navItems: NAV_ITEMS,
    pathname: "/",
    theme: "system",
    resolvedTheme: "dark",
    isActive: isNavActive,
    ...overrides,
  };
}

describe("buildCommands", () => {
  it("offers one navigation command per nav item, in nav order", () => {
    const navigate = buildCommands(context()).filter((command) => command.group === "Navigate");
    expect(navigate.map((command) => command.label)).toEqual(NAV_ITEMS.map((item) => `Go to ${item.label}`));
    expect(navigate.map((command) => command.action)).toEqual(
      NAV_ITEMS.map((item) => ({ kind: "navigate", href: item.href })),
    );
  });

  it("marks only the current page", () => {
    const current = buildCommands(context({ pathname: "/agents/abc" })).filter((command) => command.current);
    expect(current.map((command) => command.id)).toEqual(["navigate:/agents"]);
  });

  it("marks only the overview on the root path", () => {
    const current = buildCommands(context({ pathname: "/" })).filter((command) => command.current);
    expect(current.map((command) => command.id)).toEqual(["navigate:/"]);
  });

  it("toggles to light when dark is applied", () => {
    const toggle = buildCommands(context({ resolvedTheme: "dark" })).find((command) => command.id === "theme:toggle");
    expect(toggle?.label).toBe("Switch to light theme");
    expect(toggle?.action).toEqual({ kind: "set-theme", theme: "light" });
  });

  it("toggles to dark when light is applied", () => {
    const toggle = buildCommands(context({ resolvedTheme: "light" })).find((command) => command.id === "theme:toggle");
    expect(toggle?.label).toBe("Switch to dark theme");
    expect(toggle?.action).toEqual({ kind: "set-theme", theme: "dark" });
  });

  it("offers dark before the applied theme is known (pre-hydration)", () => {
    const toggle = buildCommands(context({ theme: undefined, resolvedTheme: undefined })).find(
      (command) => command.id === "theme:toggle",
    );
    expect(toggle?.action).toEqual({ kind: "set-theme", theme: "dark" });
  });

  it("offers 'Use system theme' only when the system choice is not already active", () => {
    const ids = (theme: string | undefined) => buildCommands(context({ theme })).map((command) => command.id);
    expect(ids("system")).not.toContain("theme:system");
    expect(ids("light")).toContain("theme:system");
    expect(ids("dark")).toContain("theme:system");
  });

  it("always offers the lock command, last", () => {
    const commands = buildCommands(context());
    expect(commands.at(-1)).toMatchObject({ id: "session:lock", label: "Lock console", action: { kind: "lock" } });
  });

  it("gives every command a unique id and a non-empty label", () => {
    const commands = buildCommands(context({ theme: "light" }));
    expect(new Set(commands.map((command) => command.id)).size).toBe(commands.length);
    for (const command of commands) expect(command.label.trim()).not.toBe("");
  });

  it("makes the lock command findable by common logout words", () => {
    const lock = buildCommands(context()).find((command) => command.id === "session:lock");
    expect(lock?.keywords).toEqual(expect.arrayContaining(["logout", "sign out"]));
  });
});

describe("groupCommands", () => {
  it("returns groups in COMMAND_GROUPS order with all commands", () => {
    const commands = buildCommands(context({ theme: "light" }));
    const grouped = groupCommands(commands);
    expect(grouped.map((bucket) => bucket.group)).toEqual([...COMMAND_GROUPS]);
    expect(grouped.flatMap((bucket) => bucket.commands)).toHaveLength(commands.length);
  });

  it("omits empty groups", () => {
    const onlyLock = buildCommands(context()).filter((command) => command.group === "Session");
    expect(groupCommands(onlyLock).map((bucket) => bucket.group)).toEqual(["Session"]);
  });
});

describe("palette shortcut", () => {
  const press = (overrides: Partial<ShortcutKeyEvent>): ShortcutKeyEvent => ({
    key: "k",
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    ...overrides,
  });

  it("detects Apple platforms", () => {
    expect(isApplePlatform("MacIntel")).toBe(true);
    expect(isApplePlatform("iPhone")).toBe(true);
    expect(isApplePlatform("Win32")).toBe(false);
    expect(isApplePlatform("Linux x86_64")).toBe(false);
    expect(isApplePlatform(undefined)).toBe(false);
  });

  it("labels the shortcut per platform", () => {
    expect(paletteShortcutLabel(true)).toBe("⌘K");
    expect(paletteShortcutLabel(false)).toBe("Ctrl K");
    expect(paletteAriaShortcut(true)).toBe("Meta+K");
    expect(paletteAriaShortcut(false)).toBe("Control+K");
  });

  it("matches ⌘K on Apple and Ctrl+K elsewhere, either case", () => {
    expect(isPaletteShortcut(press({ metaKey: true }), true)).toBe(true);
    expect(isPaletteShortcut(press({ key: "K", metaKey: true }), true)).toBe(true);
    expect(isPaletteShortcut(press({ ctrlKey: true }), false)).toBe(true);
  });

  it("ignores the other platform's modifier", () => {
    expect(isPaletteShortcut(press({ ctrlKey: true }), true)).toBe(false);
    expect(isPaletteShortcut(press({ metaKey: true }), false)).toBe(false);
  });

  it("ignores plain K, other keys, and Alt/Shift combinations", () => {
    expect(isPaletteShortcut(press({}), false)).toBe(false);
    expect(isPaletteShortcut(press({ key: "j", ctrlKey: true }), false)).toBe(false);
    expect(isPaletteShortcut(press({ ctrlKey: true, shiftKey: true }), false)).toBe(false);
    expect(isPaletteShortcut(press({ metaKey: true, altKey: true }), true)).toBe(false);
    expect(isPaletteShortcut(press({ metaKey: true, ctrlKey: true }), true)).toBe(false);
  });
});
