package com.agentshield.permission;

import com.agentshield.agent.Agent;
import com.agentshield.agent.AgentRepository;
import com.agentshield.dto.PermissionCreateRequest;
import com.agentshield.dto.PermissionResponse;
import com.agentshield.exception.ConflictException;
import com.agentshield.exception.ResourceNotFoundException;
import com.agentshield.model.AgentStatus;
import com.agentshield.tool.Tool;
import com.agentshield.tool.ToolRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

/**
 * Service managing explicit agent-tool permission grants.
 * Authorization decisions themselves are made by {@link PermissionEngine}.
 */
@Service
public class PermissionService {

    private final AgentToolPermissionRepository permissionRepository;
    private final AgentRepository agentRepository;
    private final ToolRepository toolRepository;

    @Autowired
    public PermissionService(AgentToolPermissionRepository permissionRepository,
                             AgentRepository agentRepository,
                             ToolRepository toolRepository) {
        this.permissionRepository = permissionRepository;
        this.agentRepository = agentRepository;
        this.toolRepository = toolRepository;
    }

    @Transactional
    public PermissionResponse grantPermission(PermissionCreateRequest request) {
        Agent agent = agentRepository.findById(request.agentId())
                .orElseThrow(() -> new ResourceNotFoundException("Agent not found."));
        Tool tool = toolRepository.findById(request.toolId())
                .orElseThrow(() -> new ResourceNotFoundException("Tool not found."));

        if (agent.getStatus() == AgentStatus.REVOKED) {
            throw new ConflictException("Permissions cannot be granted to a revoked agent.");
        }
        if (permissionRepository.existsByAgentIdAndToolId(agent.getId(), tool.getId())) {
            throw new ConflictException("A permission grant already exists for this agent and tool.");
        }

        boolean enabled = request.enabled() == null || request.enabled();
        AgentToolPermission permission = permissionRepository.save(
                new AgentToolPermission(agent, tool, request.allowedActions(), enabled));
        return PermissionResponse.from(permission);
    }

    @Transactional(readOnly = true)
    public List<PermissionResponse> getPermissionsForAgent(UUID agentId) {
        if (!agentRepository.existsById(agentId)) {
            throw new ResourceNotFoundException("Agent not found.");
        }
        return permissionRepository.findByAgentId(agentId).stream()
                .map(PermissionResponse::from)
                .toList();
    }

    @Transactional
    public void revokePermission(UUID permissionId) {
        AgentToolPermission permission = permissionRepository.findById(permissionId)
                .orElseThrow(() -> new ResourceNotFoundException("Permission not found."));
        permissionRepository.delete(permission);
    }
}
