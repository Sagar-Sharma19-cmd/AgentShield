package com.agentshield.agent;

import com.agentshield.dto.AgentCreateRequest;
import com.agentshield.dto.AgentCreateResponse;
import com.agentshield.dto.AgentResponse;
import com.agentshield.exception.ConflictException;
import com.agentshield.exception.ResourceNotFoundException;
import com.agentshield.model.AgentStatus;
import com.agentshield.security.ApiKeyGenerator;
import com.agentshield.security.ApiKeyHasher;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

/**
 * Service managing registration, lifecycle and API key credentials of AI agent identities.
 */
@Service
public class AgentService {

    private final AgentRepository agentRepository;
    private final ApiKeyGenerator apiKeyGenerator;
    private final ApiKeyHasher apiKeyHasher;

    @Autowired
    public AgentService(AgentRepository agentRepository, ApiKeyGenerator apiKeyGenerator, ApiKeyHasher apiKeyHasher) {
        this.agentRepository = agentRepository;
        this.apiKeyGenerator = apiKeyGenerator;
        this.apiKeyHasher = apiKeyHasher;
    }

    /**
     * Registers an agent and issues its first API key. The plaintext key is returned once and never stored.
     */
    @Transactional
    public AgentCreateResponse registerAgent(AgentCreateRequest request) {
        if (agentRepository.existsByName(request.name())) {
            throw new ConflictException("An agent with this name is already registered.");
        }
        Agent agent = new Agent(request.name(), request.description());
        String apiKey = issueApiKey(agent);
        return AgentCreateResponse.from(agentRepository.saveAndFlush(agent), apiKey);
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
     * Changes an agent's status. REVOKED is terminal: a revoked identity can never be re-activated,
     * and its API key is destroyed immediately.
     */
    @Transactional
    public AgentResponse updateStatus(UUID id, AgentStatus newStatus) {
        Agent agent = findAgent(id);
        if (agent.getStatus() == AgentStatus.REVOKED && newStatus != AgentStatus.REVOKED) {
            throw new ConflictException("A revoked agent cannot be re-activated or suspended.");
        }
        agent.setStatus(newStatus);
        if (newStatus == AgentStatus.REVOKED) {
            agent.clearApiKey();
        }
        return AgentResponse.from(agentRepository.saveAndFlush(agent));
    }

    /**
     * Issues a new API key and invalidates the previous one. Not allowed for revoked agents.
     */
    @Transactional
    public AgentCreateResponse rotateApiKey(UUID id) {
        Agent agent = findAgent(id);
        if (agent.getStatus() == AgentStatus.REVOKED) {
            throw new ConflictException("A revoked agent cannot be issued a new API key.");
        }
        String apiKey = issueApiKey(agent);
        return AgentCreateResponse.from(agentRepository.saveAndFlush(agent), apiKey);
    }

    private String issueApiKey(Agent agent) {
        String apiKey = apiKeyGenerator.generate();
        agent.assignApiKey(apiKeyHasher.hash(apiKey), ApiKeyGenerator.displayPrefix(apiKey));
        return apiKey;
    }

    private Agent findAgent(UUID id) {
        return agentRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Agent not found."));
    }
}
