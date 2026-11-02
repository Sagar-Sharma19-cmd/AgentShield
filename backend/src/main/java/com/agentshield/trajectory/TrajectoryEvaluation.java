package com.agentshield.trajectory;

import com.agentshield.model.RiskTier;

import java.util.List;

/**
 * Result of one trajectory analysis.
 *
 * This is a risk SIGNAL only. It is never an authorization decision and is only used to
 * escalate an existing decision (see DecisionEscalator#combineTrajectory).
 *
 * @param score            0-100 trajectory score (sum of triggered factors, capped at 100)
 * @param tier             risk tier for {@code score}
 * @param triggeredFactors features that fired, in evaluation order; empty when none fired
 * @param reason           human-readable summary built from the triggered factors
 * @param historySize      number of previous events considered (0-10)
 */
public record TrajectoryEvaluation(int score, RiskTier tier, List<TrajectoryFactor> triggeredFactors,
                                   String reason, int historySize) {
}
