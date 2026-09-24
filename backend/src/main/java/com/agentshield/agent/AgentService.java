package com.agentshield.agent;

import com.agentshield.dto.AgentCreateRequest;
import com.agentshield.dto.AgentResponse;
import com.agentshield.exception.ConflictException;
import com.agentshield.exception.ResourceNotFoundException;
import com.agentshield.model.AgentStatus;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

/**
 * Service managing registration and lifecycle of AI agent identities.
 */
@Service
public class AgentService {

    private final AgentRepository agentRepository;

    @Autowired
    public AgentService(AgentRepository agentRepository) {
        this.agentRepository = agentRepository;
    }

    @Transactional
    public AgentResponse registerAgent(AgentCreateRequest request) {
        if (agentRepository.existsByName(request.name())) {
            throw new ConflictException("An agent with this name is already registered.");
        }
        Agent agent = agentRepository.save(new Agent(request.name(), request.description()));
        return AgentResponse.from(agent);
    }

    @Transactional(readOnly = true)
    public List<AgentResponse> listAgents() {
        return agentRepository.findAll(Sort.by("createdAt")).stream()
                .map(AgentResponse::from)
                .toList();
    }

    @Transactional(readOnly = true)
    public AgentResponse getAgent(UUID id) {
        return AgentResponse.from(findAgent(id));
    }

    /**
     * Changes an agent's status. REVOKED is terminal: a revoked identity can never be re-activated.
     */
    @Transactional
    public AgentResponse updateStatus(UUID id, AgentStatus newStatus) {
        Agent agent = findAgent(id);
        if (agent.getStatus() == AgentStatus.REVOKED && newStatus != AgentStatus.REVOKED) {
            throw new ConflictException("A revoked agent cannot be re-activated or suspended.");
        }
        agent.setStatus(newStatus);
        return AgentResponse.from(agentRepository.saveAndFlush(agent));
    }

    private Agent findAgent(UUID id) {
        return agentRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Agent not found."));
    }
}
