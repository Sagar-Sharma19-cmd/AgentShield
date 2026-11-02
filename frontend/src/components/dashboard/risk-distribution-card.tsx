"use client";

import { Bar, BarChart, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { bucketRiskScores, type RiskBucket } from "@/lib/dashboard/metrics";
import { usePrefersReducedMotion } from "@/lib/hooks/use-prefers-reduced-motion";
import { useRecentEvaluations } from "@/lib/queries/dashboard";
import { DashboardCard, SectionEmpty, SectionError, SectionSkeleton } from "./section-states";

/** Chart fills come from the theme's chart tokens (globals.css), so the palette stays in one place. */
const TONE_FILL: Record<RiskBucket["tone"], string> = {
  low: "fill-chart-1",
  medium: "fill-chart-3",
  high: "fill-chart-4",
};

export function RiskDistributionCard() {
  const query = useRecentEvaluations();

  return (
    <DashboardCard
      title="Policy risk scores"
      description={
        query.data ? `Distribution across the ${query.data.content.length} most recent evaluations (0–100).` : "Distribution of recent policy risk scores (0–100)."
      }
    >
      {query.isPending ? (
        <SectionSkeleton label="Loading policy risk scores" rows={3} />
      ) : query.isError ? (
        <SectionError error={query.error} onRetry={() => void query.refetch()} subject="risk scores" />
      ) : query.data.content.length === 0 ? (
        <SectionEmpty
          title="No scores to plot"
          body="Each evaluation records a policy risk score from 0 to 100. The distribution appears after the first one."
        />
      ) : (
        <RiskDistribution buckets={bucketRiskScores(query.data.content.map((event) => event.riskScore))} />
      )}
    </DashboardCard>
  );
}

function RiskDistribution({ buckets }: { buckets: RiskBucket[] }) {
  const reducedMotion = usePrefersReducedMotion();
  const total = buckets.reduce((sum, bucket) => sum + bucket.count, 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="h-44 w-full" role="img" aria-label={`Bar chart of ${total} policy risk scores by band. Values are listed below.`}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={buckets} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 12, className: "fill-muted-foreground" }}
            />
            <YAxis
              allowDecimals={false}
              tickLine={false}
              axisLine={false}
              width={32}
              tick={{ fontSize: 12, className: "fill-muted-foreground" }}
            />
            <Tooltip
              cursor={{ className: "fill-muted" }}
              contentStyle={{ borderRadius: 8, borderColor: "var(--border)", fontSize: 12 }}
              formatter={(value) => [`${value} evaluations`, "Count"]}
            />
            <Bar dataKey="count" radius={[4, 4, 0, 0]} isAnimationActive={!reducedMotion}>
              {buckets.map((bucket) => (
                <Cell key={bucket.label} className={TONE_FILL[bucket.tone]} />
              ))}
              <LabelList dataKey="count" position="top" className="fill-foreground font-mono" fontSize={12} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <dl className="sr-only">
        {buckets.map((bucket) => (
          <div key={bucket.label}>
            <dt>Scores {bucket.label}</dt>
            <dd>{bucket.count} evaluations</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
