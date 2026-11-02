import { DECISION_TYPES } from "@/lib/labels";
import type { AgentResponse, AgentStatus, DecisionType } from "@/types/api";

/**
 * Pure derivations for the Overview dashboard. Everything here works on values the backend
 * already returns; nothing is estimated or invented. Kept free of React so it can be unit tested.
 */

export interface AgentCounts {
  registered: number;
  active: number;
  suspended: number;
  revoked: number;
}

export function countAgents(agents: Pick<AgentResponse, "status">[]): AgentCounts {
  const byStatus: Record<AgentStatus, number> = { ACTIVE: 0, SUSPENDED: 0, REVOKED: 0 };
  for (const agent of agents) {
    byStatus[agent.status] += 1;
  }
  return {
    registered: agents.length,
    active: byStatus.ACTIVE,
    suspended: byStatus.SUSPENDED,
    revoked: byStatus.REVOKED,
  };
}

export interface DecisionShare {
  decision: DecisionType;
  count: number;
  /** 0–1. Zero when there are no evaluations, so callers never divide by zero. */
  share: number;
}

export function toDecisionShares(
  total: number,
  byDecision: Record<DecisionType, number>,
): DecisionShare[] {
  return DECISION_TYPES.map((decision) => {
    const count = byDecision[decision];
    return { decision, count, share: total > 0 ? count / total : 0 };
  });
}

/** Share as a whole-number percentage for display. */
export function toPercent(share: number): number {
  return Math.round(share * 100);
}

export type RiskTone = "low" | "medium" | "high";

export interface RiskBucket {
  label: string;
  /** Inclusive lower and upper bounds of the bucket on the 0–100 policy score scale. */
  min: number;
  max: number;
  count: number;
  tone: RiskTone;
}

const RISK_BUCKET_WIDTH = 20;
const RISK_BUCKET_COUNT = 5;

/**
 * Buckets policy risk scores into five 20-point bands. Tones follow the PolicyEngine's current
 * fixed scores: ALLOW is 10–20, REVIEW is 60, DENY is 90–95 (see docs/architecture.md), so the
 * bands line up with those decision outcomes rather than inventing a new risk model.
 */
export function bucketRiskScores(scores: number[]): RiskBucket[] {
  const buckets: RiskBucket[] = Array.from({ length: RISK_BUCKET_COUNT }, (_, index) => {
    const min = index * RISK_BUCKET_WIDTH;
    const max = index === RISK_BUCKET_COUNT - 1 ? 100 : min + RISK_BUCKET_WIDTH - 1;
    return {
      label: `${min}–${max}`,
      min,
      max,
      count: 0,
      tone: index < 2 ? "low" : index < 4 ? "medium" : "high",
    };
  });

  for (const score of scores) {
    const clamped = Math.min(100, Math.max(0, score));
    const index = Math.min(RISK_BUCKET_COUNT - 1, Math.floor(clamped / RISK_BUCKET_WIDTH));
    buckets[index].count += 1;
  }

  return buckets;
}
