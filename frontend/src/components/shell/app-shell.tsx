"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight, LogOut, Menu, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { SecurityAlertsMonitor } from "@/components/alerts/security-alerts-monitor";
import { SecurityAlertsProvider } from "@/components/alerts/security-alerts-context";
import { ThemeSwitcher } from "@/components/shell/theme-switcher";
import { AdminUnlockPanel } from "@/components/shell/admin-unlock-panel";
import { PageTransition } from "@/components/motion/page-transition";
import { useAdminKey } from "@/lib/auth/admin-key";
import { breadcrumbsFor, isNavActive, NAV_ITEMS } from "@/lib/shell/navigation";
import { cn } from "@/lib/utils";

/**
 * Operator console frame: a sidebar on laptop and desktop, a sheet menu on smaller screens, and a
 * header with breadcrumbs and the theme switcher. Every route in the (console) group uses it.
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

  return (
    <div className="flex min-h-dvh flex-1 flex-col md:flex-row">
      <DesktopSidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <ConsoleHeader />
        <main id="main" className="min-w-0 flex-1">
          <SecurityAlertsProvider>
            <SecurityAlertsMonitor />
            <RouteTransition>{children}</RouteTransition>
          </SecurityAlertsProvider>
        </main>
      </div>
    </div>
  );
}

/** Short fade when the section changes (keyed on the pathname, so filter changes do not replay it). */
function RouteTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <PageTransition routeKey={pathname} className="min-h-full">
      {children}
    </PageTransition>
  );
}

function BrandMark() {
  return (
    <div className="flex items-center gap-2.5">
      <div
        aria-hidden="true"
        className="flex size-8 items-center justify-center rounded-lg bg-linear-to-br from-brand-lilac to-brand-mint text-foreground shadow-sm"
      >
        <ShieldCheck className="size-4" />
      </div>
      <div className="leading-tight">
        <p className="font-heading text-sm font-semibold tracking-tight">AgentShield</p>
        <p className="text-xs text-muted-foreground">Runtime security gateway</p>
      </div>
    </div>
  );
}

function DesktopSidebar() {
  return (
    <aside className="hidden md:sticky md:top-0 md:flex md:h-dvh md:w-60 md:shrink-0 md:flex-col md:border-r md:border-sidebar-border md:bg-sidebar md:text-sidebar-foreground">
      <div className="px-4 py-5">
        <BrandMark />
      </div>
      <NavList />
      <SessionFooter />
    </aside>
  );
}

function ConsoleHeader() {
  const pathname = usePathname();
  const crumbs = breadcrumbsFor(pathname);

  return (
    <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-border bg-background/85 px-4 backdrop-blur-md supports-[backdrop-filter]:bg-background/70 md:px-6">
      <MobileMenu />
      <nav aria-label="Breadcrumb" className="min-w-0 flex-1">
        <ol className="flex min-w-0 items-center gap-1.5 text-sm">
          {crumbs.map((crumb, index) => {
            const last = index === crumbs.length - 1;
            return (
              <li key={`${crumb.label}-${index}`} className={cn("flex min-w-0 items-center gap-1.5", !last && "hidden sm:flex")}>
                {index > 0 && <ChevronRight aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />}
                {crumb.href && !last ? (
                  <Link href={crumb.href} className="truncate text-muted-foreground hover:text-foreground">
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
      <ThemeSwitcher className="shrink-0" />
    </header>
  );
}

function MobileMenu() {
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon-sm" className="md:hidden" aria-label="Open navigation menu">
          <Menu aria-hidden="true" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-72 bg-sidebar text-sidebar-foreground sm:max-w-xs">
        <SheetHeader>
          <SheetTitle className="sr-only">Console navigation</SheetTitle>
          <SheetDescription className="sr-only">Move between console sections.</SheetDescription>
          <div className="px-1 pt-2">
            <BrandMark />
          </div>
        </SheetHeader>
        <NavList onNavigate={() => setOpen(false)} />
        <SessionFooter />
      </SheetContent>
    </Sheet>
  );
}

function NavList({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <nav aria-label="Console" className="flex flex-col gap-1 px-2">
      {NAV_ITEMS.map((item) => {
        const Icon = item.icon;
        const active = isNavActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors duration-150 outline-none focus-visible:ring-3 focus-visible:ring-ring/50 motion-reduce:transition-none",
              active
                ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground shadow-sm"
                : "text-sidebar-foreground/80 hover:bg-sidebar-accent/70 hover:text-sidebar-accent-foreground",
            )}
          >
            <Icon aria-hidden="true" className="size-4 shrink-0" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

function SessionFooter() {
  const { clearAdminKey } = useAdminKey();

  return (
    <div className="mt-auto flex items-center justify-between gap-2 border-t border-sidebar-border px-4 py-3">
      <div className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
        <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-success" />
        <span className="truncate">Admin session</span>
      </div>
      <Button variant="ghost" size="icon-sm" onClick={clearAdminKey} aria-label="Lock console">
        <LogOut aria-hidden="true" />
      </Button>
    </div>
  );
}
