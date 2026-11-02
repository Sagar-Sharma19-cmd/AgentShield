import {
  Activity,
  Bot,
  LayoutDashboard,
  ShieldAlert,
  Wrench,
  Workflow,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
}

/** Every entry is a real, routable page. Nothing is shown as "planned". */
export const NAV_ITEMS: readonly NavItem[] = [
  { label: "Overview", href: "/", icon: LayoutDashboard },
  { label: "Activity", href: "/activity", icon: Activity },
  { label: "Reviews", href: "/reviews", icon: ShieldAlert },
  { label: "Agents", href: "/agents", icon: Bot },
  { label: "Tools", href: "/tools", icon: Wrench },
  { label: "CI/CD demo", href: "/pipeline", icon: Workflow },
];

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
