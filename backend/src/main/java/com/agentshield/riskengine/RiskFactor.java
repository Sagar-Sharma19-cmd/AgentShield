package com.agentshield.riskengine;

/**
 * One explainable risk factor contributed by the Risk Engine, as returned in its
 * {@code factors} array ({@code name}, {@code score}, {@code reason}).
 */
public record RiskFactor(String name, int score, String reason) {
}
