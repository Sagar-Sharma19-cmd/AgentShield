package com.agentshield.permission;

import com.agentshield.agent.Agent;
import com.agentshield.model.ActionType;
import com.agentshield.tool.Tool;
import jakarta.persistence.CollectionTable;
import jakarta.persistence.Column;
import jakarta.persistence.ElementCollection;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;

import java.time.Instant;
import java.util.HashSet;
import java.util.Set;
import java.util.UUID;

/**
 * JPA Entity granting an agent an explicit set of actions on one tool.
 *
 * Relational model: Agent 1:N AgentToolPermission N:1 Tool.
 * At most one grant exists per (agent, tool) pair. Allowed actions are stored
 * one row per action in agent_tool_permission_actions.
 */
@Entity
@Table(name = "agent_tool_permissions",
        uniqueConstraints = @UniqueConstraint(name = "uk_agent_tool_permission", columnNames = {"agent_id", "tool_id"}))
public class AgentToolPermission {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "agent_id", nullable = false)
    private Agent agent;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "tool_id", nullable = false)
    private Tool tool;

    @ElementCollection(fetch = FetchType.EAGER)
    @CollectionTable(name = "agent_tool_permission_actions", joinColumns = @JoinColumn(name = "permission_id"))
    @Enumerated(EnumType.STRING)
    @Column(name = "action", nullable = false, length = 30)
    private Set<ActionType> allowedActions = new HashSet<>();

    @Column(nullable = false)
    private boolean enabled;

    @Column(nullable = false, updatable = false)
    private Instant createdAt;

    @Column(nullable = false)
    private Instant updatedAt;

    public AgentToolPermission() {
    }

    public AgentToolPermission(Agent agent, Tool tool, Set<ActionType> allowedActions, boolean enabled) {
        this.agent = agent;
        this.tool = tool;
        this.allowedActions = new HashSet<>(allowedActions);
        this.enabled = enabled;
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

    public boolean allows(ActionType action) {
        return allowedActions.contains(action);
    }

    public UUID getId() {
        return id;
    }

    public Agent getAgent() {
        return agent;
    }

    public Tool getTool() {
        return tool;
    }

    public Set<ActionType> getAllowedActions() {
        return allowedActions;
    }

    public boolean isEnabled() {
        return enabled;
    }

    public void setEnabled(boolean enabled) {
        this.enabled = enabled;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }
}
