"use client";

import { useSyncExternalStore } from "react";
import { useTheme } from "next-themes";
import { Monitor, Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { TOUCH_TARGET } from "./touch-target";

type ThemeChoice = "light" | "dark" | "system";

const CHOICES: { value: ThemeChoice; label: string; icon: typeof Sun }[] = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
];

const subscribeNoop = () => () => {};

/**
 * Light / dark / system switcher. The choice is persisted by next-themes. Nothing renders its
 * selected state until the client has hydrated, because the stored theme is unknown on the server.
 */
export function ThemeSwitcher({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme();
  const mounted = useSyncExternalStore(subscribeNoop, () => true, () => false);
  const current: ThemeChoice = mounted && (theme === "light" || theme === "dark") ? theme : "system";
  const currentChoice = CHOICES.find((choice) => choice.value === current) ?? CHOICES[2];
  const CurrentIcon = currentChoice.icon;

  return (
    <>
      {/* From 768 px: the segmented control. */}
      <div
        role="group"
        aria-label="Colour theme"
        className={cn("hidden items-center rounded-lg border border-border bg-card p-0.5 md:inline-flex", className)}
      >
        {CHOICES.map(({ value, label, icon: Icon }) => {
          const selected = current === value;
          return (
            <button
              key={value}
              type="button"
              aria-pressed={selected}
              aria-label={`${label} theme`}
              title={`${label} theme`}
              onClick={() => setTheme(value)}
              className={cn(
                "flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors duration-150 outline-none focus-visible:ring-3 focus-visible:ring-ring/50 motion-reduce:transition-none",
                selected ? "bg-primary text-primary-foreground" : "hover:bg-muted hover:text-foreground",
              )}
            >
              <Icon aria-hidden="true" className="size-3.5" />
            </button>
          );
        })}
      </div>

      {/* Below 768 px: one 32 px button with a 44 px hit area, opening the same three choices. */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            aria-label={`Colour theme: ${currentChoice.label}`}
            className={cn("md:hidden", TOUCH_TARGET, className)}
          >
            <CurrentIcon aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-auto">
          <DropdownMenuRadioGroup value={current} onValueChange={(value) => setTheme(value)}>
            {CHOICES.map(({ value, label, icon: Icon }) => (
              <DropdownMenuRadioItem key={value} value={value} className="min-h-11 gap-2">
                <Icon aria-hidden="true" className="size-4" />
                {label}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
