import { CircleCheck, Fingerprint, Gauge, KeyRound, Route, ScrollText, type LucideIcon } from "lucide-react";
import { GATE_LABELS, type Gate } from "@/lib/checkpoint/gates";
import { cn } from "@/lib/utils";

/** One icon per gateway gate. Always shown with its label; the icon only helps scanning. */
export const GATE_ICONS: Record<Gate, LucideIcon> = {
  IDENTITY: Fingerprint,
  PERMISSION: KeyRound,
  POLICY: ScrollText,
  RISK_ENGINE: Gauge,
  TRAJECTORY: Route,
  PASSED: CircleCheck,
};

export function GateIcon({ gate, className }: { gate: Gate; className?: string }) {
  const Icon = GATE_ICONS[gate];
  return <Icon aria-hidden="true" className={cn("size-3.5 shrink-0", className)} />;
}

/** Gate icon and label, e.g. in a table cell. */
export function GateMark({ gate, className }: { gate: Gate; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      <GateIcon gate={gate} className="text-muted-foreground" />
      <span>{GATE_LABELS[gate]}</span>
    </span>
  );
}
