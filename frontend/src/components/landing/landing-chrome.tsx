"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { LogoMark } from "@/components/shell/logo-mark";
import { Button } from "@/components/ui/button";
import { LANDING_SECTION_LABELS, LANDING_SECTIONS, SOURCE_URL, type LandingSection } from "@/lib/landing/content";
import { cn } from "@/lib/utils";

/** Hairline column guides behind the content (4 columns), hidden at 900 px and below. */
export function ColumnGuides() {
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-[1] max-[900px]:hidden">
      <div className="mx-auto grid h-full max-w-[1440px] grid-cols-4 px-6 md:px-10">
        {[0, 1, 2, 3].map((column) => (
          <div key={column} className={cn("border-l border-foreground/[0.07]", column === 3 && "border-r")} />
        ))}
      </div>
    </div>
  );
}

/** Faint paper grid for the page background (both themes; the lines use the border token). */
export function PaperGrid() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-0 opacity-60 dark:opacity-40"
      style={{
        backgroundImage:
          "linear-gradient(to right, var(--border) 1px, transparent 1px), linear-gradient(to bottom, var(--border) 1px, transparent 1px)",
        backgroundSize: "48px 48px",
        maskImage: "radial-gradient(ellipse at 60% 40%, black 30%, transparent 85%)",
      }}
    />
  );
}

export function LandingNav({ active }: { active: LandingSection }) {
  return (
    <header className="fixed inset-x-0 top-0 z-30 border-b border-border bg-background/80 backdrop-blur-md">
      <nav aria-label="Primary" className="mx-auto flex h-14 max-w-[1440px] items-center justify-between gap-4 px-6 md:px-10">
        <Link
          href="/welcome"
          className="flex items-center gap-2 rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          <LogoMark className="size-6 text-primary" />
          <span className="font-heading text-base font-semibold tracking-tight">AgentShield</span>
        </Link>
        <ul className="hidden items-center gap-1 md:flex">
          {LANDING_SECTIONS.map((section) => (
            <li key={section}>
              <a
                href={`#${section}`}
                aria-current={active === section ? "true" : undefined}
                className={cn(
                  "rounded-md px-3 py-1.5 font-mono text-[0.6875rem] tracking-[0.12em] uppercase transition-colors duration-150 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                  active === section ? "text-foreground underline decoration-2 underline-offset-[6px]" : "text-muted-foreground",
                )}
              >
                {LANDING_SECTION_LABELS[section]}
              </a>
            </li>
          ))}
          <li>
            <a
              href={SOURCE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-md px-3 py-1.5 font-mono text-[0.6875rem] tracking-[0.12em] text-muted-foreground uppercase hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              Source<span className="sr-only"> (opens in a new tab)</span>
            </a>
          </li>
        </ul>
        <Button asChild size="sm">
          <Link href="/">
            Open console
            <ArrowRight aria-hidden="true" />
          </Link>
        </Button>
      </nav>
    </header>
  );
}

/**
 * Right-rail section indicator, from 1200 px up (below that it would sit on the robot). The active section
 * has a longer bar and aria-current, not only a colour.
 */
export function SectionRail({ active }: { active: LandingSection }) {
  return (
    <nav aria-label="Sections" className="fixed top-1/2 right-6 z-20 -translate-y-1/2 max-[1199px]:hidden">
      <ol className="flex flex-col items-end gap-3">
        {LANDING_SECTIONS.map((section, index) => {
          const current = active === section;
          return (
            <li key={section}>
              <a
                href={`#${section}`}
                aria-current={current ? "true" : undefined}
                className={cn(
                  "group flex items-center gap-2 rounded-sm font-mono text-[0.625rem] tracking-[0.14em] uppercase focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                  current ? "text-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <span className="tabular-nums">{String(index + 1).padStart(2, "0")}</span>
                <span>{LANDING_SECTION_LABELS[section]}</span>
                <span aria-hidden="true" className={cn("block h-px bg-current", current ? "w-8" : "w-3")} />
              </a>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export function LandingFooter() {
  return (
    <footer className="relative z-10 border-t border-border bg-background">
      <div className="mx-auto flex max-w-[1440px] flex-col gap-6 px-6 py-10 md:flex-row md:items-center md:justify-between md:px-10">
        <div className="flex items-center gap-2">
          <LogoMark className="size-5 text-primary" />
          <p className="font-mono text-xs tracking-[0.08em] text-muted-foreground">AgentShield · MCA capstone 2026</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button asChild>
            <Link href="/">
              Open the console
              <ArrowRight aria-hidden="true" />
            </Link>
          </Button>
          <Button asChild variant="outline">
            <a href={SOURCE_URL} target="_blank" rel="noopener noreferrer">
              View the source<span className="sr-only"> on GitHub (opens in a new tab)</span>
            </a>
          </Button>
        </div>
      </div>
    </footer>
  );
}
