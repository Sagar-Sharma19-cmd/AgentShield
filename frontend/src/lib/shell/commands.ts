/**
 * Command palette model. Pure functions and data only: no React, no DOM, no router. The palette
 * component renders what buildCommands returns and executes each CommandAction itself, so the
 * list, its wording and the shortcut logic are unit-tested here (commands.test.ts).
 */
import type { NavItem } from "@/lib/shell/navigation";

export type ThemeChoice = "light" | "dark" | "system";

/** What a command does. The palette component maps each kind onto router / next-themes / admin-key calls. */
export type CommandAction =
  | { kind: "navigate"; href: string }
  | { kind: "set-theme"; theme: ThemeChoice }
  | { kind: "lock" };

export const COMMAND_GROUPS = ["Navigate", "Appearance", "Session"] as const;
export type CommandGroup = (typeof COMMAND_GROUPS)[number];

export interface PaletteCommand {
  /** Stable, unique id. Also used as the cmdk item value, so filtering never collides. */
  id: string;
  group: CommandGroup;
  label: string;
  /** Extra search terms. cmdk matches these as well as the label. */
  keywords: readonly string[];
  action: CommandAction;
  /** True for the page the operator is already on. It stays selectable but is marked. */
  current?: boolean;
}

export interface CommandContext {
  /** Navigation items, normally NAV_ITEMS. Passed in so this module has no UI imports. */
  navItems: readonly Pick<NavItem, "label" | "href">[];
  /** Current pathname, used to mark the current page. */
  pathname: string;
  /** The stored theme choice (next-themes `theme`). Undefined before hydration. */
  theme: string | undefined;
  /** The theme actually applied (next-themes `resolvedTheme`). Undefined before hydration. */
  resolvedTheme: string | undefined;
  /** Whether a pathname belongs to a nav item (normally isNavActive). */
  isActive: (pathname: string, href: string) => boolean;
}

/** Builds the palette's commands, in display order: pages, then appearance, then session. */
export function buildCommands(context: CommandContext): PaletteCommand[] {
  return [...navigationCommands(context), ...themeCommands(context), lockCommand()];
}

function navigationCommands({ navItems, pathname, isActive }: CommandContext): PaletteCommand[] {
  return navItems.map((item) => ({
    id: `navigate:${item.href}`,
    group: "Navigate",
    label: `Go to ${item.label}`,
    keywords: [item.label, item.href, "page", "open"],
    action: { kind: "navigate", href: item.href },
    current: isActive(pathname, item.href),
  }));
}

/**
 * One toggle (to the opposite of the theme currently applied) plus "Use system theme" unless the
 * system choice is already active. Before hydration the applied theme is unknown, so the toggle
 * offers dark, the console's primary theme.
 */
function themeCommands({ theme, resolvedTheme }: CommandContext): PaletteCommand[] {
  const target: ThemeChoice = resolvedTheme === "dark" ? "light" : "dark";
  const commands: PaletteCommand[] = [
    {
      id: "theme:toggle",
      group: "Appearance",
      label: target === "dark" ? "Switch to dark theme" : "Switch to light theme",
      keywords: ["theme", "toggle", "appearance", "colour", "color", target, "mode"],
      action: { kind: "set-theme", theme: target },
    },
  ];
  if (theme !== "system") {
    commands.push({
      id: "theme:system",
      group: "Appearance",
      label: "Use system theme",
      keywords: ["theme", "system", "auto", "os", "appearance"],
      action: { kind: "set-theme", theme: "system" },
    });
  }
  return commands;
}

function lockCommand(): PaletteCommand {
  return {
    id: "session:lock",
    group: "Session",
    label: "Lock console",
    keywords: ["lock", "logout", "log out", "sign out", "admin key", "session"],
    action: { kind: "lock" },
  };
}

/** Commands bucketed by group in COMMAND_GROUPS order. Empty groups are omitted. */
export function groupCommands(commands: readonly PaletteCommand[]): { group: CommandGroup; commands: PaletteCommand[] }[] {
  return COMMAND_GROUPS.map((group) => ({ group, commands: commands.filter((command) => command.group === group) })).filter(
    (bucket) => bucket.commands.length > 0,
  );
}

/* ---------------------------------------------------------------------------------------------- */
/* Keyboard shortcut                                                                               */
/* ---------------------------------------------------------------------------------------------- */

/** True for macOS, iPadOS and iOS, where the palette shortcut uses ⌘ rather than Ctrl. */
export function isApplePlatform(platform: string | undefined): boolean {
  if (!platform) return false;
  return /mac|iphone|ipad|ipod/i.test(platform);
}

/** The shortcut as shown to the user. */
export function paletteShortcutLabel(apple: boolean): string {
  return apple ? "⌘K" : "Ctrl K";
}

/** The shortcut in aria-keyshortcuts syntax. */
export function paletteAriaShortcut(apple: boolean): string {
  return apple ? "Meta+K" : "Control+K";
}

export interface ShortcutKeyEvent {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}

/**
 * ⌘K on Apple platforms, Ctrl+K elsewhere. Only the platform's own modifier counts: Ctrl+K on a Mac
 * is a text-editing shortcut, and the Windows key belongs to the OS. Alt or Shift cancels the match
 * so other shortcuts on K are left alone.
 */
export function isPaletteShortcut(event: ShortcutKeyEvent, apple: boolean): boolean {
  if (event.key.toLowerCase() !== "k") return false;
  if (event.altKey || event.shiftKey) return false;
  return apple ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey;
}
