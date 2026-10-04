package com.agentshield.riskengine;

import com.agentshield.model.RiskTier;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.UUID;

/**
 * JPA entity storing the detailed Risk Engine assessment for one gateway request.
 *
 * {@code requestId} correlates this row with the {@code audit_logs} row for the same
 * gateway evaluation. {@code factors} stores the explainable factor breakdown as a JSON
 * string (portable across PostgreSQL and the H2 test database — no JSONB column type).
 */
@Entity
@Table(name = "risk_assessments")
public class RiskAssessmentRecord {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "request_id", nullable = false)
    private UUID requestId;

    @Column(name = "risk_score", nullable = false)
    private int riskScore;

    @Enumerated(EnumType.STRING)
    @Column(name = "risk_tier", nullable = false, length = 20)
    private RiskTier riskTier;

    /** JSON-encoded list of {name, score, reason} factors. */
    @Column(name = "factors")
    private String factors;

    @Column(length = 1000)
    private String reason;

    @Column(name = "engine_available", nullable = false)
    private boolean engineAvailable;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    public RiskAssessmentRecord() {
    }

    public RiskAssessmentRecord(UUID id, UUID requestId, int riskScore, RiskTier riskTier, String factors,
                                 String reason, boolean engineAvailable, Instant createdAt) {
        this.id = id;
        this.requestId = requestId;
        this.riskScore = riskScore;
        this.riskTier = riskTier;
        this.factors = factors;
        this.reason = reason;
        this.engineAvailable = engineAvailable;
        this.createdAt = createdAt;
    }

    public UUID getId() {
        return id;
    }

    public void setId(UUID id) {
        this.id = id;
    }

    public UUID getRequestId() {
        return requestId;
    }

    public void setRequestId(UUID requestId) {
        this.requestId = requestId;
    }

    public int getRiskScore() {
        return riskScore;
    }

    public void setRiskScore(int riskScore) {
        this.riskScore = riskScore;
    }

    public RiskTier getRiskTier() {
        return riskTier;
    }

    public void setRiskTier(RiskTier riskTier) {
        this.riskTier = riskTier;
    }

    public String getFactors() {
        return factors;
    }

    public void setFactors(String factors) {
        this.factors = factors;
    }

    public String getReason() {
        return reason;
    }

    public void setReason(String reason) {
        this.reason = reason;
    }

    public boolean isEngineAvailable() {
        return engineAvailable;
    }

    public void setEngineAvailable(boolean engineAvailable) {
        this.engineAvailable = engineAvailable;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(Instant createdAt) {
        this.createdAt = createdAt;
    }

    public static Builder builder() {
        return new Builder();
    }

    public static class Builder {
        private UUID id;
        private UUID requestId;
        private int riskScore;
        private RiskTier riskTier;
        private String factors;
        private String reason;
        private boolean engineAvailable;
        private Instant createdAt;

        public Builder id(UUID id) {
            this.id = id;
            return this;
        }

        public Builder requestId(UUID requestId) {
            this.requestId = requestId;
            return this;
        }

        public Builder riskScore(int riskScore) {
            this.riskScore = riskScore;
            return this;
        }

        public Builder riskTier(RiskTier riskTier) {
            this.riskTier = riskTier;
            return this;
        }

        public Builder factors(String factors) {
            this.factors = factors;
            return this;
        }

        public Builder reason(String reason) {
            this.reason = reason;
            return this;
        }

        public Builder engineAvailable(boolean engineAvailable) {
            this.engineAvailable = engineAvailable;
            return this;
        }

        public Builder createdAt(Instant createdAt) {
            this.createdAt = createdAt;
            return this;
        }

        public RiskAssessmentRecord build() {
            return new RiskAssessmentRecord(id, requestId, riskScore, riskTier, factors, reason, engineAvailable, createdAt);
        }
    }
}
