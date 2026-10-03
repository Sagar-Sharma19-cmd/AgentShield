package com.agentshield.agent;

import com.agentshield.model.AgentStatus;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.UUID;

/**
 * JPA Entity representing an AI agent registered with AgentShield.
 * Holds identity and a hashed API key credential; the plaintext key is never stored.
 */
@Entity
@Table(name = "agents")
public class Agent {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(nullable = false, unique = true, length = 100)
    private String name;

    @Column(length = 1000)
    private String description;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private AgentStatus status;

    /** HMAC-SHA256 of the agent's API key; null when the agent has no usable key. */
    @Column(unique = true, length = 64)
    private String apiKeyHash;

    /** Non-secret display prefix of the current key, e.g. agk_live_abcd. */
    @Column(length = 16)
    private String apiKeyPrefix;

    @Column(nullable = false, updatable = false)
    private Instant createdAt;

    @Column(nullable = false)
    private Instant updatedAt;

    public Agent() {
    }

    public Agent(String name, String description) {
        this.name = name;
        this.description = description;
        this.status = AgentStatus.ACTIVE;
    }

    @PrePersist
    void onCreate() {
        Instant now = Instant.now();
        this.createdAt = now;
        this.updatedAt = now;
    }

    @PreUpdate
    void onUpdate() {
        this.updatedAt = Instant.now();
    }

    public UUID getId() {
        return id;
    }

    public String getName() {
        return name;
    }

    public String getDescription() {
        return description;
    }

    public AgentStatus getStatus() {
        return status;
    }

    public void setStatus(AgentStatus status) {
        this.status = status;
    }

    public String getApiKeyPrefix() {
        return apiKeyPrefix;
    }

    public boolean hasApiKey() {
        return apiKeyHash != null;
    }

    /**
     * Replaces the agent's credential. Any previously issued key stops working immediately.
     */
    public void assignApiKey(String apiKeyHash, String apiKeyPrefix) {
        this.apiKeyHash = apiKeyHash;
        this.apiKeyPrefix = apiKeyPrefix;
    }

    public void clearApiKey() {
        this.apiKeyHash = null;
        this.apiKeyPrefix = null;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }
}
