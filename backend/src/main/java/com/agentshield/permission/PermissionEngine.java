package com.agentshield.permission;

import com.agentshield.agent.Agent;
import com.agentshield.agent.AgentRepository;
import com.agentshield.model.ActionType;
import com.agentshield.model.AuthorizationResult;
import com.agentshield.model.ToolStatus;
import com.agentshield.security.AuthenticatedAgent;
import com.agentshield.tool.Tool;
import com.agentshield.tool.ToolRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.util.Optional;
import java.util.UUID;

/**
 * Deterministic authorization engine: decides whether the authenticated agent may perform
 * an action with a registered tool. Runs outside the AI agent, after API key authentication
 * and before the PolicyEngine.
 *
 * Checks are evaluated in order and the first failure wins (deny by default):
 * 1. Authenticated agent must exist        -> AGENT_NOT_FOUND
 * 2. Claimed agentId must be the caller    -> AGENT_IDENTITY_MISMATCH
 * 3. Agent must be ACTIVE                  -> AGENT_SUSPENDED / AGENT_REVOKED
 * 4. Tool must exist                       -> TOOL_NOT_FOUND
 * 5. Tool must be ACTIVE                   -> TOOL_DISABLED
 * 6. An agent-tool grant must exist        -> UNAUTHORIZED
 * 7. The grant must be enabled             -> PERMISSION_DISABLED
 * 8. The grant must include the action     -> UNAUTHORIZED
 * Otherwise                                -> AUTHORIZED
 */
@Component
public class PermissionEngine {

    private final AgentRepository agentRepository;
    private final ToolRepository toolRepository;
    private final AgentToolPermissionRepository permissionRepository;

    @Autowired
    public PermissionEngine(AgentRepository agentRepository,
                            ToolRepository toolRepository,
                            AgentToolPermissionRepository permissionRepository) {
        this.agentRepository = agentRepository;
        this.toolRepository = toolRepository;
        this.permissionRepository = permissionRepository;
    }

    /**
     * @param caller          agent authenticated by its API key
     * @param claimedAgentId  agentId asserted in the request body (agent UUID or unique name)
     * @param toolName        unique registered tool name
     * @param action          requested action
     */
    @Transactional(readOnly = true)
    public AuthorizationDecision authorize(AuthenticatedAgent caller, String claimedAgentId,
                                           String toolName, ActionType action) {
        Optional<Agent> maybeAgent = caller == null ? Optional.empty() : agentRepository.findById(caller.id());
        if (maybeAgent.isEmpty()) {
            return deny(AuthorizationResult.AGENT_NOT_FOUND, "Agent is not registered with AgentShield.", null, null);
        }
        Agent agent = maybeAgent.get();

        if (!identifies(agent, claimedAgentId)) {
            return deny(AuthorizationResult.AGENT_IDENTITY_MISMATCH,
                    "Authenticated agent '" + agent.getName() + "' does not match the agentId in the request.",
                    agent.getId(), null);
        }

        switch (agent.getStatus()) {
            case ACTIVE -> { }
            case SUSPENDED -> {
                return deny(AuthorizationResult.AGENT_SUSPENDED, "Agent '" + agent.getName() + "' is suspended.", agent.getId(), null);
            }
            default -> {
                return deny(AuthorizationResult.AGENT_REVOKED, "Agent '" + agent.getName() + "' has been revoked.", agent.getId(), null);
            }
        }

        Optional<Tool> maybeTool = toolName == null ? Optional.empty() : toolRepository.findByName(toolName);
        if (maybeTool.isEmpty()) {
            return deny(AuthorizationResult.TOOL_NOT_FOUND, "Tool is not registered with AgentShield.", agent.getId(), null);
        }
        Tool tool = maybeTool.get();

        if (tool.getStatus() != ToolStatus.ACTIVE) {
            return deny(AuthorizationResult.TOOL_DISABLED, "Tool '" + tool.getName() + "' is disabled.", agent.getId(), tool.getId());
        }

        Optional<AgentToolPermission> maybePermission = permissionRepository.findByAgentIdAndToolId(agent.getId(), tool.getId());
        if (maybePermission.isEmpty()) {
            return deny(AuthorizationResult.UNAUTHORIZED,
                    "Agent '" + agent.getName() + "' has no permission grant for tool '" + tool.getName() + "'.",
                    agent.getId(), tool.getId());
        }
        AgentToolPermission permission = maybePermission.get();

        if (!permission.isEnabled()) {
            return deny(AuthorizationResult.PERMISSION_DISABLED,
                    "Permission grant for agent '" + agent.getName() + "' on tool '" + tool.getName() + "' is disabled.",
                    agent.getId(), tool.getId());
        }

        if (action == null || !permission.allows(action)) {
            return deny(AuthorizationResult.UNAUTHORIZED,
                    "Agent '" + agent.getName() + "' is not permitted to perform " + action + " with tool '" + tool.getName() + "'.",
                    agent.getId(), tool.getId());
        }

        return new AuthorizationDecision(AuthorizationResult.AUTHORIZED,
                "Agent '" + agent.getName() + "' is authorized to perform " + action + " with tool '" + tool.getName() + "'.",
                agent.getId(), tool.getId());
    }

    /**
     * True when the claimed identifier is the agent's unique name or its UUID.
     */
    private boolean identifies(Agent agent, String claimedAgentId) {
        if (claimedAgentId == null || claimedAgentId.isBlank()) {
            return false;
        }
        if (claimedAgentId.equals(agent.getName())) {
            return true;
        }
        try {
            return UUID.fromString(claimedAgentId).equals(agent.getId());
        } catch (IllegalArgumentException notAUuid) {
            return false;
        }
    }

    private AuthorizationDecision deny(AuthorizationResult result, String reason, UUID agentId, UUID toolId) {
        return new AuthorizationDecision(result, reason, agentId, toolId);
    }
}
