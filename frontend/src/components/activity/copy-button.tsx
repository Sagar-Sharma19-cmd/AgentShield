"use client";

import { useEffect, useState } from "react";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/utils";

const RESET_MS = 2000;

/**
 * Copies a value to the clipboard. The result ("Copied" or a failure) is announced through a polite
 * live region, and the icon changes as well, so it is not shown by colour alone.
 */
export function CopyButton({ value, label, className }: { value: string; label: string; className?: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");

  useEffect(() => {
    if (state === "idle") return;
    const timer = window.setTimeout(() => setState("idle"), RESET_MS);
    return () => window.clearTimeout(timer);
  }, [state]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setState("copied");
    } catch {
      // Clipboard access can be denied (insecure context, permissions). Say so instead of failing silently.
      setState("failed");
    }
  }

  const Icon = state === "copied" ? Check : Copy;

  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      <button
        type="button"
        onClick={() => void copy()}
        aria-label={label}
        className="inline-flex size-7 shrink-0 items-center justify-center rounded-md border border-border text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Icon aria-hidden="true" className="size-3.5" />
      </button>
      <span aria-live="polite" className="text-xs text-muted-foreground">
        {state === "copied" ? "Copied" : state === "failed" ? "Copy failed" : ""}
      </span>
    </span>
  );
}
