"use client";

import { useCallback, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, ChevronRight, Lock, Menu, PanelLeftClose, PanelLeftOpen, Search, Server } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { SecurityAlertsMonitor } from "@/components/alerts/security-alerts-monitor";
import { SecurityAlertsProvider, useSecurityAlerts } from "@/components/alerts/security-alerts-context";
import { PageTransition } from "@/components/motion/page-transition";
import { ThemeSwitcher } from "@/components/shell/theme-switcher";
import { AdminUnlockPanel } from "@/components/shell/admin-unlock-panel";
import { CommandPalette, Kbd } from "@/components/shell/command-palette";
import { LogoTile } from "@/components/shell/logo-mark";
import { SidebarNav } from "@/components/shell/sidebar-nav";
import { useAdminKey } from "@/lib/auth/admin-key";
import { useSidebarCollapsed } from "@/lib/hooks/use-sidebar-collapsed";
import { useNow } from "@/components/reviews/use-review-clock";
import { useReviewsByStatus } from "@/lib/queries/reviews";
import { needsActionCount } from "@/lib/reviews/tabs";
import { isApplePlatform, paletteAriaShortcut, paletteShortcutLabel } from "@/lib/shell/commands";
import { environmentLabel } from "@/lib/shell/environment";
import { badgeCountLabel, breadcrumbsFor } from "@/lib/shell/navigation";
import { cn } from "@/lib/utils";
import { TOUCH_TARGET } from "@/components/shell/touch-target";
import { ALERT_FEED_HREF, focusAlertFeed } from "@/components/alerts/alert-feed-anchor";

/** Sidebar footer label, so a screenshot or demo says which stack it shows (lib/shell/environment.ts). */
const ENVIRONMENT_LABEL = environmentLabel(process.env.NEXT_PUBLIC_AGENTSHIELD_ENV);

const SIDEBAR_ID = "console-sidebar";

/**
 * Operator console frame: a collapsible sidebar on laptop and desktop, a sheet menu on smaller
 * screens, a header with breadcrumbs, search (command palette), alerts and theme. Every route in
 * the (console) group uses it. Nothing here renders until the admin key has been read, and nothing
 * past the unlock panel renders without one.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const { isReady, isUnlocked } = useAdminKey();

  if (!isReady) {
    return (
      <div className="flex flex-1 items-center justify-center" aria-busy="true" aria-label="Loading console">
        <Skeleton className="h-40 w-full max-w-md" />
      </div>
    );
  }

  if (!isUnlocked) {
    return <AdminUnlockPanel />;
  }

  return <UnlockedShell>{children}</UnlockedShell>;
}

/**
 * Mounted only while unlocked, so its queries and alert state exist only inside an admin session.
 * The alerts provider wraps the header as well as the page, so the header indicator and the
 * Overview feed read the same unread set.
 */
function UnlockedShell({ children }: { children: React.ReactNode }) {
  const [paletteOpen, setPaletteOpen] = useState(false);
  const openPalette = useCallback(() => setPaletteOpen(true), []);
  // The existing PENDING and IN_REVIEW list queries (same keys, endpoint and refresh interval as the Reviews
  // page). The badge counts reviews that need action, exactly like the Needs action tab: open and not expired.
  // Recomputed on every refetch, and on the 30 s clock tick so a review drops out when it expires.
  const now = useNow();
  const pending = useReviewsByStatus("PENDING");
  const inReview = useReviewsByStatus("IN_REVIEW");
  const pendingReviews =
    pending.isError || inReview.isError ? undefined : needsActionCount({ PENDING: pending.data, IN_REVIEW: inReview.data }, now);

  return (
    <SecurityAlertsProvider>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-primary focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:text-primary-foreground"
      >
        Skip to main content
      </a>
      <div className="flex min-h-dvh flex-1 flex-col md:flex-row">
        <DesktopSidebar pendingReviews={pendingReviews} />
        <div className="flex min-w-0 flex-1 flex-col">
          <ConsoleHeader onOpenPalette={openPalette} pendingReviews={pendingReviews} />
          <main id="main" tabIndex={-1} className="min-w-0 flex-1 focus:outline-none">
            <SecurityAlertsMonitor />
            <RouteTransition>{children}</RouteTransition>
          </main>
        </div>
      </div>
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
    </SecurityAlertsProvider>
  );
}

/**
 * Short fade when the section changes (keyed on the pathname, so filter changes do not replay it).
 * Opacity only: pages contain sticky headers, so this wrapper must never be transformed.
 */
function RouteTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <PageTransition routeKey={pathname} className="min-h-full">
      {children}
    </PageTransition>
  );
}

function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <Link
      href="/"
      aria-label="AgentShield overview"
      className="flex min-w-0 items-center gap-2.5 rounded-md outline-none focus-visible:ring-3 focus-visible:ring-ring/60"
    >
      <LogoTile />
      <span className={cn("min-w-0 leading-tight", compact && "sr-only")}>
        <span className="block font-heading text-sm font-semibold tracking-tight">AgentShield</span>
        <span className="block truncate text-xs text-muted-foreground">Runtime security gateway</span>
      </span>
    </Link>
  );
}

function DesktopSidebar({ pendingReviews }: { pendingReviews: number | undefined }) {
  const [collapsed, setCollapsed] = useSidebarCollapsed();
  const toggleLabel = collapsed ? "Expand sidebar" : "Collapse sidebar";
  const ToggleIcon = collapsed ? PanelLeftOpen : PanelLeftClose;

  return (
    // Width changes instantly (no width animation); the active indicator inside re-measures with layoutId.
    <aside
      id={SIDEBAR_ID}
      aria-label="Sidebar"
      className={cn(
        "hidden md:sticky md:top-0 md:flex md:h-dvh md:shrink-0 md:flex-col md:border-r md:border-sidebar-border md:bg-sidebar md:text-sidebar-foreground",
        collapsed ? "md:w-14" : "md:w-60",
      )}
    >
      <div className={cn("flex h-14 shrink-0 items-center border-b border-sidebar-border", collapsed ? "justify-center px-2" : "px-4")}>
        <BrandMark compact={collapsed} />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto py-4">
        <SidebarNav collapsed={collapsed} layoutGroupId="desktop-nav" pendingReviews={pendingReviews} />
      </div>
      <div className={cn("flex shrink-0 px-2 pb-2", collapsed ? "justify-center" : "justify-end")}>
        <IconButtonWithTooltip
          label={toggleLabel}
          side="right"
          onClick={() => setCollapsed(!collapsed)}
          aria-expanded={!collapsed}
          aria-controls={SIDEBAR_ID}
        >
          <ToggleIcon aria-hidden="true" />
        </IconButtonWithTooltip>
      </div>
      <SessionFooter collapsed={collapsed} />
    </aside>
  );
}

function ConsoleHeader({ onOpenPalette, pendingReviews }: { onOpenPalette: () => void; pendingReviews: number | undefined }) {
  const pathname = usePathname();
  const crumbs = breadcrumbsFor(pathname);

  return (
    <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b border-border bg-background/85 px-4 backdrop-blur-md supports-[backdrop-filter]:bg-background/70 max-md:gap-3 md:px-6">
      <MobileMenu pendingReviews={pendingReviews} />
      <nav aria-label="Breadcrumb" className="min-w-0 flex-1">
        <ol className="flex min-w-0 items-center gap-1.5 text-sm">
          {crumbs.map((crumb, index) => {
            const last = index === crumbs.length - 1;
            return (
              <li key={`${crumb.label}-${index}`} className={cn("flex min-w-0 items-center gap-1.5", !last && "hidden sm:flex")}>
                {index > 0 && <ChevronRight aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />}
                {crumb.href && !last ? (
                  <Link
                    href={crumb.href}
                    className="truncate rounded-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/60"
                  >
                    {crumb.label}
                  </Link>
                ) : (
                  <span aria-current={last ? "page" : undefined} className="truncate font-medium">
                    {crumb.label}
                  </span>
                )}
              </li>
            );
          })}
        </ol>
      </nav>
      <SearchButton onClick={onOpenPalette} />
      <AlertIndicator />
      <ThemeSwitcher className="shrink-0" />
    </header>
  );
}

const subscribeNoop = () => () => {};

/** Opens the command palette. Shows the platform's shortcut once known on the client. */
function SearchButton({ onClick }: { onClick: () => void }) {
  const apple = useSyncExternalStore(
    subscribeNoop,
    () => isApplePlatform(navigator.platform || navigator.userAgent),
    () => null,
  );

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={onClick}
      aria-label="Search pages and actions"
      aria-haspopup="dialog"
      aria-keyshortcuts={apple === null ? undefined : paletteAriaShortcut(apple)}
      className={cn("shrink-0 gap-2 text-muted-foreground max-md:h-8 max-sm:size-8 max-sm:px-0 sm:w-44 sm:justify-start", TOUCH_TARGET)}
    >
      <Search aria-hidden="true" />
      <span className="hidden sm:inline">Search…</span>
      {apple !== null ? (
        <span aria-hidden="true" className="ml-auto hidden sm:inline">
          <Kbd>{paletteShortcutLabel(apple)}</Kbd>
        </span>
      ) : null}
    </Button>
  );
}

/**
 * Unread security alerts from the existing alerts context (filled by SecurityAlertsMonitor). Links
 * straight to the Overview's alert feed (scrolled to and focused), where "Mark all read" is. The count is
 * text, not colour.
 */
function AlertIndicator() {
  const pathname = usePathname();
  const { unreadIds } = useSecurityAlerts();
  const count = unreadIds.size;
  const countLabel = badgeCountLabel(count);
  const label = count === 0 ? "Security alerts: none unread" : `Security alerts: ${count} unread`;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button asChild variant="ghost" size="icon" className={cn("shrink-0", TOUCH_TARGET)}>
          <Link
            href={ALERT_FEED_HREF}
            aria-label={label}
            onClick={(event) => {
              // Already on the Overview: a client hash link would not move focus, so do it here.
              if (pathname === "/" && focusAlertFeed()) {
                event.preventDefault();
                window.history.replaceState(null, "", ALERT_FEED_HREF);
              }
            }}
          >
            <Bell aria-hidden="true" />
            {countLabel ? (
              <span
                aria-hidden="true"
                className="absolute -top-0.5 -right-0.5 min-w-4 rounded-full bg-danger px-1 text-center font-mono text-[0.625rem] leading-4 font-medium tabular-nums text-danger-foreground ring-2 ring-background"
              >
                {countLabel}
              </span>
            ) : null}
          </Link>
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  );
}

function MobileMenu({ pendingReviews }: { pendingReviews: number | undefined }) {
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className={cn("md:hidden", TOUCH_TARGET)} aria-label="Open navigation menu">
          <Menu aria-hidden="true" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="flex w-72 flex-col gap-0 bg-sidebar p-0 text-sidebar-foreground sm:max-w-xs">
        <SheetHeader className="h-14 shrink-0 justify-center border-b border-sidebar-border px-4">
          <SheetTitle className="sr-only">Console navigation</SheetTitle>
          <SheetDescription className="sr-only">Move between console sections.</SheetDescription>
          <BrandMark />
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto py-4">
          <SidebarNav layoutGroupId="mobile-nav" pendingReviews={pendingReviews} onNavigate={() => setOpen(false)} />
        </div>
        <SessionFooter collapsed={false} />
      </SheetContent>
    </Sheet>
  );
}

function SessionFooter({ collapsed }: { collapsed: boolean }) {
  const { clearAdminKey } = useAdminKey();

  return (
    <div
      className={cn(
        "flex shrink-0 border-t border-sidebar-border",
        collapsed ? "flex-col items-center gap-2 px-2 py-3" : "items-center justify-between gap-2 px-4 py-3",
      )}
    >
      <div className={cn("flex min-w-0 items-center gap-2 text-xs text-muted-foreground", collapsed && "flex-col")}>
        <span className={cn("flex min-w-0 items-center gap-1.5", collapsed && "sr-only")}>
          <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-success" />
          <span className="truncate">Admin session</span>
        </span>
        <span
          title={collapsed ? `Environment: ${ENVIRONMENT_LABEL}` : undefined}
          className="inline-flex items-center gap-1 rounded border border-sidebar-border px-1.5 py-0.5 font-mono text-[0.6875rem] text-muted-foreground"
        >
          <Server aria-hidden="true" className="size-3" />
          <span className="sr-only">Environment: </span>
          <span className={cn(collapsed && "sr-only")}>{ENVIRONMENT_LABEL}</span>
        </span>
      </div>
      <IconButtonWithTooltip label="Lock console" side={collapsed ? "right" : "top"} onClick={clearAdminKey}>
        <Lock aria-hidden="true" />
      </IconButtonWithTooltip>
    </div>
  );
}

function IconButtonWithTooltip({
  label,
  side,
  children,
  ...props
}: { label: string; side: "top" | "right" | "bottom" } & Omit<React.ComponentProps<typeof Button>, "aria-label">) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={label} {...props}>
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent side={side}>{label}</TooltipContent>
    </Tooltip>
  );
}
