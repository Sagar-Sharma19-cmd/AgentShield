package com.agentshield.trajectory;

/**
 * One triggered trajectory feature with its contribution to the score and a human-readable reason.
 */
public record TrajectoryFactor(String name, int score, String reason) {
}
