"use client";

import { useEffect, useId, useRef, useState } from "react";
import { motion } from "motion/react";
import { ClipboardCheck, Pause, Play, History as AuditIcon, type LucideIcon } from "lucide-react";
import { GATE_ICONS } from "@/components/checkpoint/gate-mark";
import { Button } from "@/components/ui/button";
import { applyCarouselKey, stepIndex } from "@/lib/landing/carousel";
import { PIPELINE_STAGES } from "@/lib/landing/content";
import { cn } from "@/lib/utils";
import { ACCENT_GRADIENT } from "./landing-primitives";

const AUTO_ADVANCE_MS = 6000;

const STAGE_ICONS: Record<string, LucideIcon> = {
  identity: GATE_ICONS.IDENTITY,
  permission: GATE_ICONS.PERMISSION,
  policy: GATE_ICONS.POLICY,
  "risk-engine": GATE_ICONS.RISK_ENGINE,
  trajectory: GATE_ICONS.TRAJECTORY,
  "human-review": ClipboardCheck,
  audit: AuditIcon,
};

/**
 * The gateway stages as tabs (WAI-ARIA tabs pattern: one tab stop, Left/Right/Home/End move and select).
 * It advances on its own every 6 s while the section is on screen, unless the operator paused it, is
 * hovering or focused inside it, or prefers reduced motion. A visible Pause control stops it.
 */
export function PipelineCarousel({ active, reducedMotion }: { active: boolean; reducedMotion: boolean }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [holding, setHolding] = useState(false);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const baseId = useId();
  const count = PIPELINE_STAGES.length;
  const autoplay = active && !paused && !holding && !reducedMotion;

  useEffect(() => {
    if (!autoplay) return;
    const id = window.setTimeout(() => setIndex((current) => stepIndex(current, 1, count)), AUTO_ADVANCE_MS);
    return () => window.clearTimeout(id);
  }, [autoplay, index, count]);

  function select(next: number, focus: boolean) {
    setIndex(next);
    if (focus) tabRefs.current[next]?.focus();
  }

  function onKeyDown(event: React.KeyboardEvent) {
    const next = applyCarouselKey(index, event.key, count);
    if (next === null) return;
    event.preventDefault();
    select(next, true);
  }

  const stage = PIPELINE_STAGES[index];
  const Icon = STAGE_ICONS[stage.id];

  return (
    <div
      className="flex flex-col gap-4"
      onMouseEnter={() => setHolding(true)}
      onMouseLeave={() => setHolding(false)}
      onFocus={() => setHolding(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setHolding(false);
      }}
    >
      <div role="tablist" aria-label="Gateway stages" onKeyDown={onKeyDown} className="flex flex-wrap gap-1.5">
        {PIPELINE_STAGES.map((item, itemIndex) => {
          const selected = itemIndex === index;
          return (
            <button
              key={item.id}
              ref={(element) => {
                tabRefs.current[itemIndex] = element;
              }}
              type="button"
              role="tab"
              id={`${baseId}-tab-${item.id}`}
              aria-selected={selected}
              aria-controls={`${baseId}-panel`}
              tabIndex={selected ? 0 : -1}
              onClick={() => select(itemIndex, false)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 font-mono text-[0.6875rem] tracking-[0.08em] uppercase transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                selected
                  ? "border-foreground/60 bg-foreground text-background"
                  : "border-border bg-background/70 text-muted-foreground hover:text-foreground",
              )}
            >
              <span className="tabular-nums">{String(itemIndex + 1).padStart(2, "0")}</span>
              {item.label}
            </button>
          );
        })}
      </div>

      <div
        role="tabpanel"
        id={`${baseId}-panel`}
        aria-labelledby={`${baseId}-tab-${stage.id}`}
        className="relative flex min-h-[9.5rem] flex-col gap-3 overflow-hidden rounded-xl border border-border bg-card/85 p-5 backdrop-blur-sm"
      >
        <div className="flex items-center justify-between gap-3">
          <span className="inline-flex items-center gap-2 font-heading text-lg font-semibold">
            <Icon aria-hidden="true" className="size-4 text-primary" />
            {stage.label}
          </span>
          <span className="font-mono text-xs tabular-nums text-muted-foreground">
            {String(index + 1).padStart(2, "0")} / {String(count).padStart(2, "0")}
          </span>
        </div>
        <motion.p
          key={stage.id}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.2 }}
          className="max-w-xl text-sm leading-relaxed text-muted-foreground"
        >
          {stage.line}
        </motion.p>
        {!reducedMotion && (
          <span aria-hidden="true" className="absolute inset-x-0 bottom-0 h-0.5 bg-border">
            <motion.span
              key={`${stage.id}-${autoplay}`}
              className="block h-full origin-left"
              style={{ backgroundImage: ACCENT_GRADIENT }}
              initial={{ scaleX: 0 }}
              animate={{ scaleX: autoplay ? 1 : 0 }}
              transition={{ duration: autoplay ? AUTO_ADVANCE_MS / 1000 : 0, ease: "linear" }}
            />
          </span>
        )}
      </div>

      {!reducedMotion && (
        <div>
          <Button variant="ghost" size="sm" onClick={() => setPaused((value) => !value)} aria-pressed={paused}>
            {paused ? <Play aria-hidden="true" /> : <Pause aria-hidden="true" />}
            {paused ? "Resume auto-advance" : "Pause auto-advance"}
          </Button>
        </div>
      )}
    </div>
  );
}
