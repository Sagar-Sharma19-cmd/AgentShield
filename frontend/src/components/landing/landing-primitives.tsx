"use client";

import { useSyncExternalStore } from "react";
import { DECISION_MARKS } from "@/components/checkpoint/decision-mark";
import { cn } from "@/lib/utils";
import type { DecisionType } from "@/types/api";

export const EYEBROW = "font-mono text-[0.6875rem] tracking-[0.14em] text-muted-foreground uppercase";

/**
 * Paper backing for one text block at 900 px and below, where the robot can sit behind content. It wraps the
 * block tightly (w-fit), so the robot stays visible around and between blocks; cards already have their own.
 */
export const PAPER = "max-[900px]:w-fit max-[900px]:max-w-full max-[900px]:rounded-lg max-[900px]:bg-background/85 max-[900px]:px-3 max-[900px]:py-2 max-[900px]:backdrop-blur-sm";

/** Headline sizes. Kept separate from the shared classes and never passed through cn(): tailwind-merge
 * treats a text-[…] size as overriding leading-[…], which is what loosened the section headlines. */
export const HEADLINE_SIZES = {
  intro: "text-[clamp(3rem,8.5vw,7.25rem)]",
  section: "text-[clamp(2.25rem,4.6vw,5rem)]",
} as const;

const HEADLINE_BASE = "flex flex-col items-start gap-3 font-heading font-semibold";
const HEADLINE_RHYTHM = "leading-[0.98] tracking-[-0.03em]";

/**
 * Two-line headline with the intro's spacing: each line is its own box, stacked with the same gap. The
 * second line is outlined too, or has an invisible border of the same width so both lines align.
 */
export function SplitHeadline({
  as: Tag = "h2",
  id,
  size,
  first,
  second,
  outlineSecond = false,
  className,
  renderLine = (line) => line,
}: {
  as?: "h1" | "h2";
  id?: string;
  size: keyof typeof HEADLINE_SIZES;
  first: string;
  second: string;
  outlineSecond?: boolean;
  className?: string;
  /** Wraps each line, e.g. in a motion element for the reveal. */
  renderLine?: (line: React.ReactNode, index: number) => React.ReactNode;
}) {
  return (
    <Tag id={id} className={`${HEADLINE_BASE} ${HEADLINE_SIZES[size]} ${HEADLINE_RHYTHM} ${className ?? ""}`}>
      {renderLine(<OutlinedWord>{first}</OutlinedWord>, 0)}
      {renderLine(
        outlineSecond ? (
          <OutlinedWord>{second}</OutlinedWord>
        ) : (
          <span className={`inline-block border border-transparent px-[0.16em] pb-[0.04em] ${WORD_BACKING}`}>{second}</span>
        ),
        1,
      )}
    </Tag>
  );
}

/** The page's one accent gradient, built from the Graphite accent tokens. Decorative only. */
export const ACCENT_GRADIENT = "linear-gradient(90deg, var(--primary), var(--brand-sky))";

const REDUCED_QUERY = "(prefers-reduced-motion: reduce)";

function subscribeReduced(onChange: () => void) {
  const media = window.matchMedia(REDUCED_QUERY);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

/** True when the OS asks for reduced motion. False on the server, so the first client render may switch once. */
export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribeReduced,
    () => window.matchMedia(REDUCED_QUERY).matches,
    () => false,
  );
}

/**
 * Paper backing behind every headline word, at every width: the robot is drawn behind all text, and the
 * backing keeps a headline readable while the robot passes behind it.
 */
const WORD_BACKING = "bg-background/90";

/** A headline word in an outlined box with corner ticks and an accent hairline on top. */
export function OutlinedWord({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={cn("relative inline-block border border-foreground/20 px-[0.16em] pb-[0.04em]", WORD_BACKING, className)}>
      <span aria-hidden="true" className="absolute inset-x-0 -top-px h-[2px]" style={{ backgroundImage: ACCENT_GRADIENT }} />
      {(["-left-[3px] -top-[3px]", "-right-[3px] -top-[3px]", "-left-[3px] -bottom-[3px]", "-right-[3px] -bottom-[3px]"] as const).map(
        (position) => (
          <span key={position} aria-hidden="true" className={cn("absolute size-[5px] border border-foreground/40 bg-background", position)} />
        ),
      )}
      {children}
    </span>
  );
}

/** Decision as icon + label + tone. Colour always comes with the icon shape and the word. */
export function DecisionTag({ decision, className }: { decision: DecisionType; className?: string }) {
  const { icon: Icon, tone } = DECISION_MARKS[decision];
  return (
    <span className={cn("inline-flex items-center gap-1.5 font-mono text-xs font-medium tracking-wide uppercase", tone, className)}>
      <Icon aria-hidden="true" className="size-4 shrink-0" />
      {decision}
    </span>
  );
}
