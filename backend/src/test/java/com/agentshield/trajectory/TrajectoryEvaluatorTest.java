package com.agentshield.trajectory;

import com.agentshield.model.ActionType;
import com.agentshield.model.DecisionType;
import com.agentshield.model.ResourceSensitivity;
import com.agentshield.model.RiskTier;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Unit tests for the five trajectory features, the score cap, the tier thresholds, and the
 * history window. No Spring context: TrajectoryEvaluator is pure.
 */
class TrajectoryEvaluatorTest {

    private static final Instant NOW = Instant.parse("2026-01-01T12:00:00Z");

    private final TrajectoryEvaluator evaluator = new TrajectoryEvaluator();

    // ------------------------------------------------------------------
    // Feature 1: DENIAL_DENSITY
    // ------------------------------------------------------------------

    @Test
    @DisplayName("DENIAL_DENSITY: a single denial does not fire")
    void singleDenialDoesNotFire() {
        TrajectoryEvaluation result = evaluate(
                List.of(event(10, ActionType.READ, "fs", ResourceSensitivity.CRITICAL, DecisionType.DENY)),
                candidate(ActionType.READ, "fs"));

        assertTrue(factor(result, TrajectoryEvaluator.DENIAL_DENSITY).isEmpty());
    }

    @Test
    @DisplayName("DENIAL_DENSITY: two denials score 20")
    void twoDenialsScore20() {
        TrajectoryEvaluation result = evaluate(
                List.of(event(10, ActionType.READ, "fs", ResourceSensitivity.INTERNAL, DecisionType.DENY),
                        event(20, ActionType.READ, "fs", ResourceSensitivity.INTERNAL, DecisionType.DENY)),
                candidate(ActionType.READ, "fs"));

        assertEquals(20, factor(result, TrajectoryEvaluator.DENIAL_DENSITY).orElseThrow().score());
    }

    @Test
    @DisplayName("DENIAL_DENSITY: five denials are capped at 30")
    void denialsAreCappedAt30() {
        TrajectoryEvaluation result = evaluate(denials(5), candidate(ActionType.READ, "fs"));

        assertEquals(30, factor(result, TrajectoryEvaluator.DENIAL_DENSITY).orElseThrow().score());
    }

    @Test
    @DisplayName("DENIAL_DENSITY: denials beyond the 10-event window are ignored")
    void denialsOutsideWindowIgnored() {
        List<TrajectoryEvent> history = new ArrayList<>();
        for (int i = 0; i < TrajectoryEvaluator.HISTORY_WINDOW; i++) {
            history.add(event(i, ActionType.READ, "fs", ResourceSensitivity.INTERNAL, DecisionType.ALLOW));
        }
        // Newest first: positions 11 and 12 are older than the window.
        history.add(event(100, ActionType.READ, "fs", ResourceSensitivity.INTERNAL, DecisionType.DENY));
        history.add(event(101, ActionType.READ, "fs", ResourceSensitivity.INTERNAL, DecisionType.DENY));

        TrajectoryEvaluation result = evaluate(history, candidate(ActionType.READ, "fs"));

        assertTrue(factor(result, TrajectoryEvaluator.DENIAL_DENSITY).isEmpty());
        assertEquals(TrajectoryEvaluator.HISTORY_WINDOW, result.historySize());
    }

    // ------------------------------------------------------------------
    // Feature 2: SENSITIVE_READ_THEN_EGRESS
    // ------------------------------------------------------------------

    @Test
    @DisplayName("SENSITIVE_READ_THEN_EGRESS: outbound request after a CRITICAL read scores 40")
    void sensitiveReadThenEgressFires() {
        TrajectoryEvaluation result = evaluate(
                List.of(event(10, ActionType.READ, "fs", ResourceSensitivity.CRITICAL, DecisionType.ALLOW)),
                candidate(ActionType.EXTERNAL_REQUEST, "http"));

        assertEquals(40, factor(result, TrajectoryEvaluator.SENSITIVE_READ_THEN_EGRESS).orElseThrow().score());
    }

    @Test
    @DisplayName("SENSITIVE_READ_THEN_EGRESS: a SENSITIVE read also fires")
    void sensitiveTierReadAlsoFires() {
        TrajectoryEvaluation result = evaluate(
                List.of(event(10, ActionType.READ, "fs", ResourceSensitivity.SENSITIVE, DecisionType.ALLOW)),
                candidate(ActionType.EXTERNAL_REQUEST, "http"));

        assertTrue(factor(result, TrajectoryEvaluator.SENSITIVE_READ_THEN_EGRESS).isPresent());
    }

    @Test
    @DisplayName("SENSITIVE_READ_THEN_EGRESS: does not fire for an internal read")
    void internalReadDoesNotFire() {
        TrajectoryEvaluation result = evaluate(
                List.of(event(10, ActionType.READ, "fs", ResourceSensitivity.INTERNAL, DecisionType.ALLOW)),
                candidate(ActionType.EXTERNAL_REQUEST, "http"));

        assertTrue(factor(result, TrajectoryEvaluator.SENSITIVE_READ_THEN_EGRESS).isEmpty());
    }

    @Test
    @DisplayName("SENSITIVE_READ_THEN_EGRESS: does not fire for a sensitive write, or for a non-egress candidate")
    void sensitiveWriteOrNonEgressDoesNotFire() {
        TrajectoryEvaluation sensitiveWrite = evaluate(
                List.of(event(10, ActionType.WRITE, "fs", ResourceSensitivity.CRITICAL, DecisionType.ALLOW)),
                candidate(ActionType.EXTERNAL_REQUEST, "http"));
        TrajectoryEvaluation nonEgress = evaluate(
                List.of(event(10, ActionType.READ, "fs", ResourceSensitivity.CRITICAL, DecisionType.ALLOW)),
                candidate(ActionType.READ, "fs"));

        assertTrue(factor(sensitiveWrite, TrajectoryEvaluator.SENSITIVE_READ_THEN_EGRESS).isEmpty());
        assertTrue(factor(nonEgress, TrajectoryEvaluator.SENSITIVE_READ_THEN_EGRESS).isEmpty());
    }

    // ------------------------------------------------------------------
    // Feature 3: ACTION_ESCALATION
    // ------------------------------------------------------------------

    @Test
    @DisplayName("ACTION_ESCALATION: a high-impact action after only READ/WRITE scores 20")
    void escalationAfterLowImpactFires() {
        TrajectoryEvaluation result = evaluate(
                List.of(event(10, ActionType.READ, "fs", ResourceSensitivity.INTERNAL, DecisionType.ALLOW)),
                candidate(ActionType.DELETE, "fs"));

        assertEquals(20, factor(result, TrajectoryEvaluator.ACTION_ESCALATION).orElseThrow().score());
    }

    @Test
    @DisplayName("ACTION_ESCALATION: does not fire with no history")
    void escalationWithNoHistoryDoesNotFire() {
        TrajectoryEvaluation result = evaluate(List.of(), candidate(ActionType.DELETE, "fs"));

        assertTrue(factor(result, TrajectoryEvaluator.ACTION_ESCALATION).isEmpty());
    }

    @Test
    @DisplayName("ACTION_ESCALATION: does not fire when a high-impact action already occurred")
    void escalationAfterPriorHighImpactDoesNotFire() {
        TrajectoryEvaluation result = evaluate(
                List.of(event(10, ActionType.READ, "fs", ResourceSensitivity.INTERNAL, DecisionType.ALLOW),
                        event(20, ActionType.DELETE, "fs", ResourceSensitivity.SENSITIVE, DecisionType.REVIEW)),
                candidate(ActionType.EXECUTE, "fs"));

        assertTrue(factor(result, TrajectoryEvaluator.ACTION_ESCALATION).isEmpty());
    }

    @Test
    @DisplayName("ACTION_ESCALATION: does not fire for a low-impact candidate")
    void lowImpactCandidateDoesNotFire() {
        TrajectoryEvaluation result = evaluate(
                List.of(event(10, ActionType.READ, "fs", ResourceSensitivity.INTERNAL, DecisionType.ALLOW)),
                candidate(ActionType.WRITE, "fs"));

        assertTrue(factor(result, TrajectoryEvaluator.ACTION_ESCALATION).isEmpty());
    }

    // ------------------------------------------------------------------
    // Feature 4: TOOL_FAN_OUT
    // ------------------------------------------------------------------

    @Test
    @DisplayName("TOOL_FAN_OUT: three distinct tools including the candidate's do not fire")
    void threeDistinctToolsDoNotFire() {
        TrajectoryEvaluation result = evaluate(
                List.of(event(10, ActionType.READ, "fs", ResourceSensitivity.INTERNAL, DecisionType.ALLOW),
                        event(20, ActionType.READ, "notes", ResourceSensitivity.INTERNAL, DecisionType.ALLOW),
                        event(30, ActionType.READ, "search", ResourceSensitivity.INTERNAL, DecisionType.ALLOW)),
                candidate(ActionType.READ, "fs"));

        assertTrue(factor(result, TrajectoryEvaluator.TOOL_FAN_OUT).isEmpty());
    }

    @Test
    @DisplayName("TOOL_FAN_OUT: the candidate's own tool counts toward the four-tool threshold")
    void candidateToolCountsTowardFanOut() {
        List<TrajectoryEvent> history = List.of(
                event(10, ActionType.READ, "fs", ResourceSensitivity.INTERNAL, DecisionType.ALLOW),
                event(20, ActionType.READ, "notes", ResourceSensitivity.INTERNAL, DecisionType.ALLOW),
                event(30, ActionType.READ, "search", ResourceSensitivity.INTERNAL, DecisionType.ALLOW));

        TrajectoryEvaluation withNewTool = evaluate(history, candidate(ActionType.READ, "docs"));

        assertEquals(15, factor(withNewTool, TrajectoryEvaluator.TOOL_FAN_OUT).orElseThrow().score());
    }

    @Test
    @DisplayName("TOOL_FAN_OUT: four distinct tools in history score 15")
    void fourToolsInHistoryFire() {
        TrajectoryEvaluation result = evaluate(
                List.of(event(10, ActionType.READ, "fs", ResourceSensitivity.INTERNAL, DecisionType.ALLOW),
                        event(20, ActionType.READ, "notes", ResourceSensitivity.INTERNAL, DecisionType.ALLOW),
                        event(30, ActionType.READ, "search", ResourceSensitivity.INTERNAL, DecisionType.ALLOW),
                        event(40, ActionType.READ, "docs", ResourceSensitivity.INTERNAL, DecisionType.ALLOW)),
                candidate(ActionType.READ, "fs"));

        assertEquals(15, factor(result, TrajectoryEvaluator.TOOL_FAN_OUT).orElseThrow().score());
    }

    // ------------------------------------------------------------------
    // Feature 5: BURST_RATE
    // ------------------------------------------------------------------

    @Test
    @DisplayName("BURST_RATE: five events within 60 seconds score 15")
    void fiveRecentEventsFire() {
        TrajectoryEvaluation result = evaluate(recentReads(5, 5), candidate(ActionType.READ, "fs"));

        assertEquals(15, factor(result, TrajectoryEvaluator.BURST_RATE).orElseThrow().score());
    }

    @Test
    @DisplayName("BURST_RATE: four recent events do not fire")
    void fourRecentEventsDoNotFire() {
        TrajectoryEvaluation result = evaluate(recentReads(4, 5), candidate(ActionType.READ, "fs"));

        assertTrue(factor(result, TrajectoryEvaluator.BURST_RATE).isEmpty());
    }

    @Test
    @DisplayName("BURST_RATE: events older than 60 seconds do not count")
    void eventsOutsideBurstWindowDoNotCount() {
        TrajectoryEvaluation result = evaluate(recentReads(5, 61), candidate(ActionType.READ, "fs"));

        assertTrue(factor(result, TrajectoryEvaluator.BURST_RATE).isEmpty());
    }

    @Test
    @DisplayName("BURST_RATE: an event exactly 60 seconds old is inside the window")
    void eventExactlyAtBurstWindowEdgeCounts() {
        List<TrajectoryEvent> atEdge = new ArrayList<>();
        for (int i = 0; i < TrajectoryEvaluator.BURST_MIN_EVENTS; i++) {
            atEdge.add(event(TrajectoryEvaluator.BURST_WINDOW_SECONDS, ActionType.READ, "fs",
                    ResourceSensitivity.INTERNAL, DecisionType.ALLOW));
        }

        TrajectoryEvaluation result = evaluate(atEdge, candidate(ActionType.READ, "fs"));

        assertTrue(factor(result, TrajectoryEvaluator.BURST_RATE).isPresent());
    }

    // ------------------------------------------------------------------
    // Aggregation: score, cap, tier
    // ------------------------------------------------------------------

    @Test
    @DisplayName("Score is the sum of triggered factors and maps to HIGH at 60")
    void sumOfFactorsAndTier() {
        // 3 denials (30) + fan-out with 4 tools (15) + burst of 5 (15) = 60 -> HIGH
        List<TrajectoryEvent> history = new ArrayList<>();
        history.add(event(1, ActionType.READ, "fs", ResourceSensitivity.CRITICAL, DecisionType.DENY));
        history.add(event(2, ActionType.READ, "notes", ResourceSensitivity.CRITICAL, DecisionType.DENY));
        history.add(event(3, ActionType.READ, "search", ResourceSensitivity.CRITICAL, DecisionType.DENY));
        history.add(event(4, ActionType.READ, "docs", ResourceSensitivity.INTERNAL, DecisionType.ALLOW));
        history.add(event(5, ActionType.READ, "fs", ResourceSensitivity.INTERNAL, DecisionType.ALLOW));

        TrajectoryEvaluation result = evaluate(history, candidate(ActionType.READ, "fs"));

        assertEquals(60, result.score());
        assertEquals(RiskTier.HIGH, result.tier());
        assertEquals(List.of(TrajectoryEvaluator.DENIAL_DENSITY, TrajectoryEvaluator.TOOL_FAN_OUT,
                TrajectoryEvaluator.BURST_RATE), names(result));
        assertEquals(5, result.historySize());
    }

    @Test
    @DisplayName("Score is capped at 100 when all five features fire")
    void scoreCappedAt100() {
        // Denials 30 + sensitive-read-then-egress 40 + escalation 20 + fan-out 15 + burst 15 = 120 -> 100
        List<TrajectoryEvent> history = new ArrayList<>();
        history.add(event(1, ActionType.READ, "fs", ResourceSensitivity.CRITICAL, DecisionType.DENY));
        history.add(event(2, ActionType.READ, "notes", ResourceSensitivity.CRITICAL, DecisionType.DENY));
        history.add(event(3, ActionType.READ, "search", ResourceSensitivity.CRITICAL, DecisionType.DENY));
        history.add(event(4, ActionType.READ, "docs", ResourceSensitivity.INTERNAL, DecisionType.ALLOW));
        history.add(event(5, ActionType.READ, "fs", ResourceSensitivity.INTERNAL, DecisionType.ALLOW));

        TrajectoryEvaluation result = evaluate(history, candidate(ActionType.EXTERNAL_REQUEST, "outbound"));

        assertEquals(TrajectoryEvaluator.MAX_SCORE, result.score());
        assertEquals(RiskTier.CRITICAL, result.tier());
        assertEquals(5, result.triggeredFactors().size());
    }

    @ParameterizedTest(name = "score {0} -> {1}")
    @CsvSource({"0,LOW", "29,LOW", "30,MEDIUM", "59,MEDIUM", "60,HIGH", "79,HIGH", "80,CRITICAL", "100,CRITICAL"})
    @DisplayName("Tier thresholds match the Risk Engine (0-29 LOW, 30-59 MEDIUM, 60-79 HIGH, 80-100 CRITICAL)")
    void tierThresholds(int score, RiskTier expected) {
        assertEquals(expected, TrajectoryEvaluator.tierFor(score));
    }

    @Test
    @DisplayName("No triggered factors: score 0, LOW, and a reason that says nothing fired")
    void noFactorsIsLowAndExplained() {
        TrajectoryEvaluation result = evaluate(List.of(), candidate(ActionType.READ, "fs"));

        assertEquals(0, result.score());
        assertEquals(RiskTier.LOW, result.tier());
        assertTrue(result.triggeredFactors().isEmpty());
        assertTrue(result.reason().contains("No trajectory risk factors triggered"));
        assertEquals(0, result.historySize());
    }

    @Test
    @DisplayName("Same input always produces the same result")
    void deterministic() {
        List<TrajectoryEvent> history = denials(3);
        TrajectoryEvent candidate = candidate(ActionType.READ, "fs");

        assertEquals(evaluator.evaluate(history, candidate), evaluator.evaluate(history, candidate));
    }

    @Test
    @DisplayName("Candidate is never taken from history: a candidate's own denial in the window is not a prior denial")
    void candidateNotCountedAsHistory() {
        // The candidate's decision is supplied separately. One prior denial plus a DENY candidate must not
        // count as two denials: DENIAL_DENSITY only counts history.
        TrajectoryEvaluation result = evaluate(
                List.of(event(10, ActionType.READ, "fs", ResourceSensitivity.INTERNAL, DecisionType.DENY)),
                new TrajectoryEvent(NOW, ActionType.READ, "fs", ResourceSensitivity.INTERNAL, DecisionType.DENY));

        assertFalse(factor(result, TrajectoryEvaluator.DENIAL_DENSITY).isPresent());
    }

    // ------------------------------------------------------------------
    // Helpers
    // ------------------------------------------------------------------

    private TrajectoryEvaluation evaluate(List<TrajectoryEvent> history, TrajectoryEvent candidate) {
        return evaluator.evaluate(history, candidate);
    }

    private static TrajectoryEvent candidate(ActionType action, String tool) {
        return new TrajectoryEvent(NOW, action, tool, ResourceSensitivity.INTERNAL, DecisionType.ALLOW);
    }

    private static TrajectoryEvent event(int secondsAgo, ActionType action, String tool,
                                         ResourceSensitivity sensitivity, DecisionType decision) {
        return new TrajectoryEvent(NOW.minusSeconds(secondsAgo), action, tool, sensitivity, decision);
    }

    private static List<TrajectoryEvent> denials(int count) {
        List<TrajectoryEvent> events = new ArrayList<>();
        for (int i = 0; i < count; i++) {
            events.add(event(10 + i, ActionType.READ, "fs-" + i, ResourceSensitivity.CRITICAL, DecisionType.DENY));
        }
        return events;
    }

    /** {@code count} ALLOW reads, each {@code gapSeconds} apart, starting {@code gapSeconds} before now. */
    private static List<TrajectoryEvent> recentReads(int count, int gapSeconds) {
        List<TrajectoryEvent> events = new ArrayList<>();
        for (int i = 1; i <= count; i++) {
            events.add(event(i * gapSeconds, ActionType.READ, "fs", ResourceSensitivity.INTERNAL, DecisionType.ALLOW));
        }
        return events;
    }

    private static Optional<TrajectoryFactor> factor(TrajectoryEvaluation evaluation, String name) {
        return evaluation.triggeredFactors().stream().filter(f -> f.name().equals(name)).findFirst();
    }

    private static List<String> names(TrajectoryEvaluation evaluation) {
        return evaluation.triggeredFactors().stream().map(TrajectoryFactor::name).toList();
    }
}
