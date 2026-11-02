"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  Bot,
  KeyRound,
  LayoutDashboard,
  LogOut,
  ShieldCheck,
  ShieldAlert,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAdminKey } from "@/lib/auth/admin-key";
import { cn } from "@/lib/utils";
import { AdminUnlockPanel } from "./admin-unlock-panel";

interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  /** Only sections with a real implementation are linked. Planned sections are shown disabled. */
  available: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { label: "Overview", href: "/", icon: LayoutDashboard, available: true },
  { label: "Activity", href: "/activity", icon: Activity, available: true },
  { label: "Reviews", href: "/reviews", icon: ShieldAlert, available: false },
  { label: "Agents", href: "/agents", icon: Bot, available: false },
  { label: "Tools", href: "/tools", icon: Wrench, available: false },
  { label: "Permissions", href: "/permissions", icon: KeyRound, available: false },
];

/**
 * Operator console frame: product identity, navigation and session control. Below the md
 * breakpoint the sidebar becomes a horizontal, scrollable nav strip above the content.
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
      <Sidebar />
      <main id="main" className="min-w-0 flex-1">
        {children}
      </main>
    </div>
  );
}

function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex flex-col border-b border-sidebar-border bg-sidebar text-sidebar-foreground md:sticky md:top-0 md:h-dvh md:w-56 md:shrink-0 md:border-r md:border-b-0">
      <div className="flex items-center gap-2.5 px-4 py-4 md:py-5">
        <div className="flex size-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
          <ShieldCheck aria-hidden="true" className="size-4" />
        </div>
        <div className="leading-tight">
          <p className="text-sm font-semibold tracking-tight">AgentShield</p>
          <p className="hidden text-xs text-muted-foreground md:block">Runtime security gateway</p>
        </div>
      </div>

      <nav aria-label="Console" className="flex gap-1 overflow-x-auto px-2 pb-2 md:flex-col md:overflow-visible md:pb-0">
        {NAV_ITEMS.map((item) => (
          <NavLink key={item.href} item={item} active={pathname === item.href} />
        ))}
      </nav>

      <SessionControl />
    </aside>
  );
}

function NavLink({ item, active }: { item: NavItem; active: boolean }) {
  const Icon = item.icon;
  const className = cn(
    "flex shrink-0 items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors duration-150 motion-reduce:transition-none",
    active && "bg-sidebar-accent font-medium text-sidebar-accent-foreground",
    item.available && !active && "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
    !item.available && "cursor-default text-muted-foreground/70",
  );

  if (!item.available) {
    return (
      <span aria-disabled="true" className={className} title="Not built yet">
        <Icon aria-hidden="true" className="size-4" />
        {item.label}
        <span className="ml-auto hidden text-[0.7rem] uppercase tracking-wide md:inline">Planned</span>
      </span>
    );
  }

  return (
    <Link href={item.href} className={className} aria-current={active ? "page" : undefined}>
      <Icon aria-hidden="true" className="size-4" />
      {item.label}
    </Link>
  );
}

function SessionControl() {
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
