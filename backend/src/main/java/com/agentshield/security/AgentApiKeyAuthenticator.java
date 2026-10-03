package com.agentshield.security;

import com.agentshield.agent.AgentRepository;
import com.agentshield.model.AgentStatus;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.util.Optional;

/**
 * Resolves a raw agent API key to the registered agent that owns it.
 *
 * Authentication only establishes identity. SUSPENDED agents still authenticate so that their
 * requests are denied and audited by the PermissionEngine; REVOKED agents never authenticate.
 */
@Component
public class AgentApiKeyAuthenticator {

    private final AgentRepository agentRepository;
    private final ApiKeyHasher apiKeyHasher;

    @Autowired
    public AgentApiKeyAuthenticator(AgentRepository agentRepository, ApiKeyHasher apiKeyHasher) {
        this.agentRepository = agentRepository;
        this.apiKeyHasher = apiKeyHasher;
    }

    @Transactional(readOnly = true)
    public Optional<AuthenticatedAgent> authenticate(String rawKey) {
        if (!ApiKeyGenerator.hasValidFormat(rawKey)) {
            return Optional.empty();
        }
        return agentRepository.findByApiKeyHash(apiKeyHasher.hash(rawKey))
                .filter(agent -> agent.getStatus() != AgentStatus.REVOKED)
                .map(agent -> new AuthenticatedAgent(agent.getId(), agent.getName()));
    }
}
