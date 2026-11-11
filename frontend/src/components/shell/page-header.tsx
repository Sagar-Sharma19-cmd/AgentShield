import { cn } from "@/lib/utils";

/** Small uppercase label above a heading. The console's one eyebrow style. */
export const EYEBROW_CLASS = "font-mono text-[0.6875rem] font-medium tracking-[0.08em] text-muted-foreground uppercase";

/**
 * Every console page's frame: one width, one padding and one vertical rhythm (gap-5). `wide` is for pages whose
 * main view needs the room (the CI/CD pipeline).
 */
export function PageContainer({ wide = false, className, children }: { wide?: boolean; className?: string; children: React.ReactNode }) {
  return (
    <div className={cn("mx-auto flex w-full flex-col gap-5 p-4 md:p-8", wide ? "max-w-[100rem]" : "max-w-7xl", className)}>
      {children}
    </div>
  );
}

/**
 * The page header every console page uses: eyebrow ("Group · Topic", matching the sidebar group), the page's
 * only h1, a one-line description, and actions on the right (below on narrow screens).
 */
export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  headingId,
  headingFocusable = false,
}: {
  eyebrow: string;
  title: string;
  description: React.ReactNode;
  actions?: React.ReactNode;
  headingId?: string;
  /** For pages that return focus to the heading (tabIndex -1; never in the tab order). */
  headingFocusable?: boolean;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-3">
      <div className="flex min-w-0 flex-col gap-1">
        <p className={EYEBROW_CLASS}>{eyebrow}</p>
        <h1
          id={headingId}
          tabIndex={headingFocusable ? -1 : undefined}
          className="rounded-sm font-heading text-2xl font-semibold tracking-tight outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          {title}
        </h1>
        <p className="max-w-2xl text-sm text-muted-foreground">{description}</p>
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}
