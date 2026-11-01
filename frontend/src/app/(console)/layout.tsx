import { AppShell } from "@/components/shell/app-shell";

/** Operator console frame. Every route in the (console) group shares the sidebar and session gate. */
export default function ConsoleLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
