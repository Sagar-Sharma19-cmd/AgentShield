"use client";

import { useId } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutGroup, motion } from "motion/react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { springs } from "@/lib/motion/tokens";
import { badgeCountLabel, isNavActive, navSections, type NavItem } from "@/lib/shell/navigation";
import { cn } from "@/lib/utils";

export interface SidebarNavProps {
  /** Icon rail: labels and group headings become screen-reader-only, and a tooltip shows the label. */
  collapsed?: boolean;
  /** Called after a link is chosen (the mobile sheet closes itself with it). */
  onNavigate?: () => void;
  /**
   * Namespaces the shared layoutId of the active indicator. The desktop sidebar and the mobile sheet
   * can both be mounted, and each needs its own indicator.
   */
  layoutGroupId: string;
  /** PENDING review count for the Reviews badge. Undefined while unknown, so no badge is shown. */
  pendingReviews?: number;
}

const REVIEWS_HREF = "/reviews";

/** Grouped console navigation built from NAV_ITEMS (via navSections). */
export function SidebarNav({ collapsed = false, onNavigate, layoutGroupId, pendingReviews }: SidebarNavProps) {
  const pathname = usePathname();
  const baseId = useId();

  return (
    <LayoutGroup id={layoutGroupId}>
      <nav aria-label="Console" className={cn("flex flex-col gap-4", collapsed ? "px-2" : "px-3")}>
        {navSections().map((section, index) => {
          const headingId = `${baseId}-${section.id}`;
          return (
            <div key={section.id} className="flex flex-col gap-0.5">
              {collapsed && index > 0 ? <div aria-hidden="true" className="mx-2 mb-2 h-px bg-sidebar-border" /> : null}
              <p
                id={headingId}
                className={cn(
                  "px-2.5 pb-1 text-[0.6875rem] font-medium tracking-wide text-muted-foreground uppercase",
                  collapsed && "sr-only",
                )}
              >
                {section.label}
              </p>
              <ul aria-labelledby={headingId} className="flex flex-col gap-0.5">
                {section.items.map((item) => (
                  <li key={item.href}>
                    <NavLink
                      item={item}
                      active={isNavActive(pathname, item.href)}
                      collapsed={collapsed}
                      count={item.href === REVIEWS_HREF ? pendingReviews : undefined}
                      onNavigate={onNavigate}
                    />
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </nav>
    </LayoutGroup>
  );
}

interface NavLinkProps {
  item: NavItem;
  active: boolean;
  collapsed: boolean;
  count: number | undefined;
  onNavigate?: () => void;
}

function NavLink({ item, active, collapsed, count, onNavigate }: NavLinkProps) {
  const Icon = item.icon;
  const countLabel = badgeCountLabel(count);

  const link = (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        "relative flex h-9 items-center gap-2.5 rounded-md text-sm outline-none transition-colors duration-150 focus-visible:ring-3 focus-visible:ring-ring/60 motion-reduce:transition-none",
        collapsed ? "justify-center px-0" : "px-2.5",
        active
          ? "font-medium text-sidebar-accent-foreground"
          : "text-sidebar-foreground/75 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
      )}
    >
      {active ? (
        // The pill moves between items with a shared layoutId (spring, transform-only). MotionConfig's
        // reducedMotion="user" turns that into an instant jump. The primary bar marks the active item
        // by shape as well as colour.
        <motion.span
          layoutId="nav-active-indicator"
          aria-hidden="true"
          transition={springs.snappy}
          className="absolute inset-0 rounded-md bg-sidebar-accent ring-1 ring-sidebar-border"
        >
          <span className="absolute inset-y-2 left-0 w-[3px] rounded-full bg-primary" />
        </motion.span>
      ) : null}
      <Icon aria-hidden="true" className="relative size-4 shrink-0" />
      <span className={cn("relative min-w-0 flex-1 truncate", collapsed && "sr-only")}>{item.label}</span>
      {countLabel ? <CountBadge label={countLabel} collapsed={collapsed} /> : null}
    </Link>
  );

  if (!collapsed) return link;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{link}</TooltipTrigger>
      <TooltipContent side="right" sideOffset={8}>
        {item.label}
        {countLabel ? ` · ${countLabel} pending` : null}
      </TooltipContent>
    </Tooltip>
  );
}

/** Pending count. The number is visible; "pending" is added for screen readers so the link reads "Reviews 3 pending". */
function CountBadge({ label, collapsed }: { label: string; collapsed: boolean }) {
  return (
    <span
      className={cn(
        "relative rounded-full border border-warning/50 bg-warning/20 font-mono font-medium tabular-nums text-warning-text",
        collapsed
          ? "absolute -top-0.5 right-0.5 min-w-4 px-1 text-center text-[0.625rem] leading-4"
          : "ml-auto px-1.5 text-[0.6875rem] leading-5",
      )}
    >
      {label}
      <span className="sr-only"> pending</span>
    </span>
  );
}
