"use client";

import { createElement, useEffect, useMemo } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { AnimatePresence, motion } from "motion/react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { Lock, Monitor, Moon, Sun, type LucideIcon } from "lucide-react";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { useAdminKey } from "@/lib/auth/admin-key";
import { durations, easings } from "@/lib/motion/tokens";
import {
  buildCommands,
  groupCommands,
  isApplePlatform,
  isPaletteShortcut,
  type CommandAction,
  type PaletteCommand,
} from "@/lib/shell/commands";
import { isNavActive, NAV_ITEMS } from "@/lib/shell/navigation";

export interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Selector for any other open modal (dialogs, alert dialogs, the mobile menu sheet). */
const OTHER_OPEN_DIALOG = '[role="dialog"][data-state="open"]:not([data-command-palette]), [role="alertdialog"][data-state="open"]';

/** Platform check for the shortcut, run in event handlers only (never during render). */
function onApplePlatform(): boolean {
  return isApplePlatform(navigator.platform || navigator.userAgent);
}

/**
 * ⌘K / Ctrl+K command palette: go to a page, change theme, lock the console. The command list comes
 * from buildCommands (src/lib/shell/commands.ts); this component only renders it and runs actions.
 *
 * Built on Radix Dialog (focus trap, Esc, focus return, scroll lock, title for screen readers) and
 * cmdk (combobox semantics, arrow-key selection). The open/close animation is a scale + fade from the
 * motion tokens; the scale is a transform, so reduced-motion users get the fade only.
 */
export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { theme, resolvedTheme, setTheme } = useTheme();
  const { clearAdminKey } = useAdminKey();

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (!isPaletteShortcut(event, onApplePlatform())) return;
      // Do not stack on top of another modal (for example the one-time agent key dialog).
      if (!open && document.querySelector(OTHER_OPEN_DIALOG)) return;
      event.preventDefault();
      onOpenChange(!open);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onOpenChange]);

  const groups = useMemo(
    () => groupCommands(buildCommands({ navItems: NAV_ITEMS, pathname, theme, resolvedTheme, isActive: isNavActive })),
    [pathname, theme, resolvedTheme],
  );

  function run(action: CommandAction) {
    onOpenChange(false);
    switch (action.kind) {
      case "navigate":
        router.push(action.href);
        break;
      case "set-theme":
        setTheme(action.theme);
        break;
      case "lock":
        clearAdminKey();
        break;
    }
  }

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <AnimatePresence>
        {open ? (
          <DialogPrimitive.Portal forceMount>
            <DialogPrimitive.Overlay forceMount asChild>
              <motion.div
                className="fixed inset-0 z-50 bg-black/40 supports-backdrop-filter:backdrop-blur-[2px]"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: durations.fast, ease: easings.standard }}
              />
            </DialogPrimitive.Overlay>
            <DialogPrimitive.Content forceMount asChild data-command-palette="">
              {/* Centred with inset + auto margins (no translate), so the scale transform does not fight positioning. */}
              <motion.div
                className="fixed inset-x-4 top-[12vh] z-50 mx-auto flex max-w-lg flex-col overflow-hidden rounded-xl border border-border bg-popover text-popover-foreground shadow-lg outline-none"
                initial={{ opacity: 0, scale: 0.97 }}
                animate={{ opacity: 1, scale: 1, transition: { duration: durations.base, ease: easings.enter } }}
                exit={{ opacity: 0, scale: 0.97, transition: { duration: durations.fast, ease: easings.exit } }}
              >
                <DialogPrimitive.Title className="sr-only">Command palette</DialogPrimitive.Title>
                <DialogPrimitive.Description className="sr-only">
                  Type to filter. Use the arrow keys to choose a command, Enter to run it and Escape to close.
                </DialogPrimitive.Description>
                <Command label="Commands" loop className="rounded-none! bg-transparent">
                  <CommandInput placeholder="Search pages and actions…" aria-label="Search commands" />
                  <CommandList className="max-h-[min(22rem,60vh)]">
                    <CommandEmpty>No matching commands.</CommandEmpty>
                    {groups.map(({ group, commands }) => (
                      <CommandGroup key={group} heading={group}>
                        {commands.map((command) => (
                          <PaletteItem key={command.id} command={command} onRun={run} />
                        ))}
                      </CommandGroup>
                    ))}
                  </CommandList>
                </Command>
                <PaletteFooter />
              </motion.div>
            </DialogPrimitive.Content>
          </DialogPrimitive.Portal>
        ) : null}
      </AnimatePresence>
    </DialogPrimitive.Root>
  );
}

const THEME_ICONS: Record<string, LucideIcon> = { light: Sun, dark: Moon, system: Monitor };

function iconFor(action: CommandAction): LucideIcon {
  switch (action.kind) {
    case "navigate":
      return NAV_ITEMS.find((item) => item.href === action.href)?.icon ?? Monitor;
    case "set-theme":
      return THEME_ICONS[action.theme] ?? Monitor;
    case "lock":
      return Lock;
  }
}

function PaletteItem({ command, onRun }: { command: PaletteCommand; onRun: (action: CommandAction) => void }) {
  // createElement with a static lookup: the icon is a module-level component, not one created per render.
  const icon = createElement(iconFor(command.action), { "aria-hidden": true, className: "text-muted-foreground" });
  return (
    <CommandItem
      value={command.label}
      keywords={[...command.keywords]}
      onSelect={() => onRun(command.action)}
      className="h-9 cursor-pointer data-selected:bg-primary/12 data-selected:text-foreground data-selected:ring-1 data-selected:ring-primary/30"
    >
      {icon}
      <span className="truncate">{command.label}</span>
      {command.current ? (
        <span className="ml-auto rounded border border-border px-1.5 text-[0.6875rem] text-muted-foreground">Current page</span>
      ) : null}
    </CommandItem>
  );
}

function PaletteFooter() {
  return (
    <div aria-hidden="true" className="flex items-center gap-3 border-t border-border bg-muted/40 px-3 py-2 text-[0.6875rem] text-muted-foreground">
      <span><Kbd>↑</Kbd> <Kbd>↓</Kbd> select</span>
      <span><Kbd>↵</Kbd> run</span>
      <span className="ml-auto"><Kbd>Esc</Kbd> close</span>
    </div>
  );
}

export function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded border border-border bg-background px-1 font-mono text-[0.6875rem] font-medium text-muted-foreground">
      {children}
    </kbd>
  );
}
