import { Cloud, Database, FolderTree, GitBranch, Globe, SquareTerminal, Wrench, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ToolType } from "@/types/api";

/** One icon per tool type. Always shown next to the type's text label; the icon only helps scanning. */
export const TOOL_TYPE_ICONS: Record<ToolType, LucideIcon> = {
  FILESYSTEM: FolderTree,
  DATABASE: Database,
  SOURCE_CONTROL: GitBranch,
  HTTP: Globe,
  CLOUD_STORAGE: Cloud,
  SHELL: SquareTerminal,
  OTHER: Wrench,
};

/** Decorative type tile. Pass null for a tool whose type is unknown (a grant for a tool not in the list). */
export function ToolTypeIcon({ type, className }: { type: ToolType | null; className?: string }) {
  const Icon = type ? TOOL_TYPE_ICONS[type] : Wrench;
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex size-8 shrink-0 items-center justify-center rounded-md border border-border bg-muted/50 text-muted-foreground",
        className,
      )}
    >
      <Icon className="size-4" />
    </span>
  );
}
