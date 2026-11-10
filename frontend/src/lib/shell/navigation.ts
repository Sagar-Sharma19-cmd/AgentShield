import {
  Activity,
  Bot,
  LayoutDashboard,
  ShieldAlert,
  Wrench,
  Workflow,
  type LucideIcon,
} from "lucide-react";

/** Sidebar sections, in display order. */
export const NAV_GROUPS = [
  { id: "monitor", label: "Monitor" },
  { id: "respond", label: "Respond" },
  { id: "configure", label: "Configure" },
  { id: "demo", label: "Demo" },
] as const;

export type NavGroupId = (typeof NAV_GROUPS)[number]["id"];

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  group: NavGroupId;
}

/**
 * The single source of truth for console navigation: the sidebar, the mobile menu, breadcrumbs and
 * the command palette all derive from it. Every entry is a real, routable page. Nothing is shown as
 * "planned".
 */
export const NAV_ITEMS: readonly NavItem[] = [
  { label: "Overview", href: "/", icon: LayoutDashboard, group: "monitor" },
  { label: "Activity", href: "/activity", icon: Activity, group: "monitor" },
  { label: "Reviews", href: "/reviews", icon: ShieldAlert, group: "respond" },
  { label: "Agents", href: "/agents", icon: Bot, group: "configure" },
  { label: "Tools", href: "/tools", icon: Wrench, group: "configure" },
  { label: "CI/CD demo", href: "/pipeline", icon: Workflow, group: "demo" },
];

export interface NavSection {
  id: NavGroupId;
  label: string;
  items: NavItem[];
}

/**
 * NAV_ITEMS arranged by NAV_GROUPS, keeping item order within a group. Groups with no items are
 * omitted, so an empty heading is never rendered.
 */
export function navSections(items: readonly NavItem[] = NAV_ITEMS): NavSection[] {
  return NAV_GROUPS.map((group) => ({
    id: group.id,
    label: group.label,
    items: items.filter((item) => item.group === group.id),
  })).filter((section) => section.items.length > 0);
}

/** Short text for a count badge: nothing for zero or invalid counts, "99+" above 99. */
export function badgeCountLabel(count: number | undefined): string | null {
  if (count === undefined || !Number.isFinite(count) || count <= 0) return null;
  return count > 99 ? "99+" : String(Math.trunc(count));
}

/** "/" is active only on the overview itself; other items match their own path and sub-paths. */
export function isNavActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export interface Crumb {
  label: string;
  href?: string;
}

/** Breadcrumb trail for the header. Unknown paths fall back to the console root only. */
export function breadcrumbsFor(pathname: string): Crumb[] {
  const current = NAV_ITEMS.find((item) => isNavActive(pathname, item.href));
  if (!current || current.href === "/") {
    return [{ label: "Console" }, { label: current?.label ?? "Overview" }];
  }
  return [{ label: "Console", href: "/" }, { label: current.label }];
}
