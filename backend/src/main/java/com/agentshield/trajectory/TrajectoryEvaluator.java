package com.agentshield.trajectory;

import com.agentshield.model.ActionType;
import com.agentshield.model.DecisionType;
import com.agentshield.model.ResourceSensitivity;
import com.agentshield.model.RiskTier;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.util.ArrayList;
import java.util.EnumSet;
import java.util.HashSet;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * Deterministic, explainable trajectory analysis over one session's recent history.
 *
 * Pure and read-only: no database access, no clock reads, no side effects. The caller
 * supplies the history and the candidate request. Given the same inputs it always returns
 * the same result.
 *
 * Five features, each contributing a fixed number of points (capped at 100 in total):
 * <ol>
 *   <li>DENIAL_DENSITY: 2 or more recent DENY decisions. 10 points each, capped at 30.</li>
 *   <li>SENSITIVE_READ_THEN_EGRESS: candidate is EXTERNAL_REQUEST and a recent READ touched
 *       a SENSITIVE or CRITICAL resource. 40 points.</li>
 *   <li>ACTION_ESCALATION: candidate is DELETE, EXECUTE or EXTERNAL_REQUEST and the history
 *       holds only READ/WRITE actions. 20 points.</li>
 *   <li>TOOL_FAN_OUT: 4 or more distinct tools across history plus candidate. 15 points.</li>
 *   <li>BURST_RATE: 5 or more recent events within 60 seconds before the candidate. 15 points.</li>
 * </ol>
 *
 * Tier thresholds match the Python Risk Engine (risk-engine/scoring.py): 0-29 LOW,
 * 30-59 MEDIUM, 60-79 HIGH, 80-100 CRITICAL.
 *
 * The evaluator returns a risk signal only. It never produces a DecisionType.
 */
@Component
public class TrajectoryEvaluator {

    /** Maximum number of previous events considered. Must match the repository query (Top10). */
    public static final int HISTORY_WINDOW = 10;

    static final String DENIAL_DENSITY = "DENIAL_DENSITY";
    static final String SENSITIVE_READ_THEN_EGRESS = "SENSITIVE_READ_THEN_EGRESS";
    static final String ACTION_ESCALATION = "ACTION_ESCALATION";
    static final String TOOL_FAN_OUT = "TOOL_FAN_OUT";
    static final String BURST_RATE = "BURST_RATE";

    static final int DENIAL_MIN_COUNT = 2;
    static final int DENIAL_POINTS_EACH = 10;
    static final int DENIAL_POINTS_CAP = 30;

    static final int SENSITIVE_READ_EGRESS_POINTS = 40;

    static final int ACTION_ESCALATION_POINTS = 20;

    static final int FAN_OUT_MIN_TOOLS = 4;
    static final int FAN_OUT_POINTS = 15;

    static final int BURST_WINDOW_SECONDS = 60;
    static final int BURST_MIN_EVENTS = 5;
    static final int BURST_POINTS = 15;

    static final int MAX_SCORE = 100;
    static final int LOW_MAX_SCORE = 29;
    static final int MEDIUM_MAX_SCORE = 59;
    static final int HIGH_MAX_SCORE = 79;

    private static final Set<ActionType> HIGH_IMPACT_ACTIONS =
            EnumSet.of(ActionType.DELETE, ActionType.EXECUTE, ActionType.EXTERNAL_REQUEST);

    /**
     * @param history   previous events for the same session and verified agent. Newest first
     *                  (the repository's ordering). Only the first {@link #HISTORY_WINDOW} are used.
     * @param candidate the current request, with the decision it would receive before trajectory escalation
     */
    public TrajectoryEvaluation evaluate(List<TrajectoryEvent> history, TrajectoryEvent candidate) {
        List<TrajectoryEvent> window = history.stream().limit(HISTORY_WINDOW).toList();

        List<TrajectoryFactor> factors = new ArrayList<>();
        denialDensity(window).ifPresent(factors::add);
        sensitiveReadThenEgress(window, candidate).ifPresent(factors::add);
        actionEscalation(window, candidate).ifPresent(factors::add);
        toolFanOut(window, candidate).ifPresent(factors::add);
        burstRate(window, candidate).ifPresent(factors::add);

        int score = Math.min(MAX_SCORE, factors.stream().mapToInt(TrajectoryFactor::score).sum());
        RiskTier tier = tierFor(score);
        return new TrajectoryEvaluation(score, tier, List.copyOf(factors), summarize(factors, tier, window.size()),
                window.size());
    }

    /** Maps a 0-100 trajectory score to a risk tier using the shared thresholds. */
    public static RiskTier tierFor(int score) {
        if (score <= LOW_MAX_SCORE) {
            return RiskTier.LOW;
        }
        if (score <= MEDIUM_MAX_SCORE) {
            return RiskTier.MEDIUM;
        }
        if (score <= HIGH_MAX_SCORE) {
            return RiskTier.HIGH;
        }
        return RiskTier.CRITICAL;
    }

    private Optional<TrajectoryFactor> denialDensity(List<TrajectoryEvent> window) {
        long denials = window.stream().filter(e -> e.decision() == DecisionType.DENY).count();
        if (denials < DENIAL_MIN_COUNT) {
            return Optional.empty();
        }
        int score = (int) Math.min(DENIAL_POINTS_CAP, denials * DENIAL_POINTS_EACH);
        return Optional.of(new TrajectoryFactor(DENIAL_DENSITY, score,
                denials + " of the last " + window.size() + " requests in this session were denied."));
    }

    private Optional<TrajectoryFactor> sensitiveReadThenEgress(List<TrajectoryEvent> window, TrajectoryEvent candidate) {
        if (candidate.action() != ActionType.EXTERNAL_REQUEST) {
            return Optional.empty();
        }
        boolean sensitiveRead = window.stream()
                .anyMatch(e -> e.action() == ActionType.READ && isSensitive(e.resourceSensitivity()));
        if (!sensitiveRead) {
            return Optional.empty();
        }
        return Optional.of(new TrajectoryFactor(SENSITIVE_READ_THEN_EGRESS, SENSITIVE_READ_EGRESS_POINTS,
                "An outbound request follows an earlier read of a sensitive or critical resource in this session."));
    }

    private Optional<TrajectoryFactor> actionEscalation(List<TrajectoryEvent> window, TrajectoryEvent candidate) {
        if (!HIGH_IMPACT_ACTIONS.contains(candidate.action()) || window.isEmpty()) {
            return Optional.empty();
        }
        boolean priorHighImpact = window.stream().anyMatch(e -> HIGH_IMPACT_ACTIONS.contains(e.action()));
        if (priorHighImpact) {
            return Optional.empty();
        }
        return Optional.of(new TrajectoryFactor(ACTION_ESCALATION, ACTION_ESCALATION_POINTS,
                candidate.action() + " follows only READ or WRITE actions earlier in this session."));
    }

    private Optional<TrajectoryFactor> toolFanOut(List<TrajectoryEvent> window, TrajectoryEvent candidate) {
        Set<String> tools = new HashSet<>();
        window.forEach(e -> tools.add(e.tool()));
        tools.add(candidate.tool());
        if (tools.size() < FAN_OUT_MIN_TOOLS) {
            return Optional.empty();
        }
        return Optional.of(new TrajectoryFactor(TOOL_FAN_OUT, FAN_OUT_POINTS,
                tools.size() + " distinct tools were used in this session's recent requests, including this one."));
    }

    private Optional<TrajectoryFactor> burstRate(List<TrajectoryEvent> window, TrajectoryEvent candidate) {
        Instant since = candidate.timestamp().minusSeconds(BURST_WINDOW_SECONDS);
        long recent = window.stream().filter(e -> !e.timestamp().isBefore(since)).count();
        if (recent < BURST_MIN_EVENTS) {
            return Optional.empty();
        }
        return Optional.of(new TrajectoryFactor(BURST_RATE, BURST_POINTS,
                recent + " requests in this session arrived within the last " + BURST_WINDOW_SECONDS + " seconds."));
    }

    private static boolean isSensitive(ResourceSensitivity sensitivity) {
        return sensitivity == ResourceSensitivity.SENSITIVE || sensitivity == ResourceSensitivity.CRITICAL;
    }

    private static String summarize(List<TrajectoryFactor> factors, RiskTier tier, int historySize) {
        if (factors.isEmpty()) {
            return "No trajectory risk factors triggered across " + historySize + " prior events.";
        }
        return tier + " trajectory risk: "
                + factors.stream().map(TrajectoryFactor::reason).collect(Collectors.joining(" "));
    }
}
