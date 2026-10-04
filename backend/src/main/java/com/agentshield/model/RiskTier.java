package com.agentshield.model;

/**
 * Risk tier classification returned by the Risk Engine (0-100 risk_score mapped to a tier).
 * Mirrors risk-engine/scoring.py's RiskTier: LOW (0-29), MEDIUM (30-59), HIGH (60-79), CRITICAL (80-100).
 */
public enum RiskTier {
    LOW,
    MEDIUM,
    HIGH,
    CRITICAL
}
