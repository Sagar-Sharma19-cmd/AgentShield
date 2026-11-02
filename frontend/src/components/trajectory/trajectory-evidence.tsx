import {
  formatTrajectoryScore,
  isTrajectoryEscalation,
  TRAJECTORY_TIER_LABELS,
  type TrajectoryEvidence,
} from "@/lib/trajectory/model";

/**
 * Compact trajectory line for a feed row or card. Shows nothing when trajectory was not evaluated,
 * so legacy rows and disabled analysis stay quiet. The tier and score are text, not colour alone.
 * The score is labelled as trajectory, so it is never confused with the policy risk score.
 */
export function TrajectorySummary({ evidence }: { evidence: TrajectoryEvidence }) {
  if (evidence.kind !== "evaluated") return null;

  return (
    <div className="flex flex-col gap-0.5">
      <p className="flex flex-wrap items-center gap-2 text-xs">
        <span className="text-muted-foreground">Trajectory</span>
        {evidence.tier ? (
          <span className="rounded-md border px-1.5 py-0.5 font-medium">{TRAJECTORY_TIER_LABELS[evidence.tier]}</span>
        ) : null}
        <span className="font-mono tabular-nums">{formatTrajectoryScore(evidence.score)}</span>
      </p>
      {evidence.reason ? <p className="line-clamp-2 text-xs text-muted-foreground">{evidence.reason}</p> : null}
    </div>
  );
}

/** Text badge shown only when trajectory analysis raised the decision. Other sources show no badge. */
export function TrajectoryEscalationBadge({ escalatedBy }: { escalatedBy: unknown }) {
  if (!isTrajectoryEscalation(escalatedBy)) return null;

  return (
    <span className="rounded-md border border-foreground/40 px-1.5 py-0.5 text-[0.7rem] font-medium">
      Escalated by trajectory
    </span>
  );
}
