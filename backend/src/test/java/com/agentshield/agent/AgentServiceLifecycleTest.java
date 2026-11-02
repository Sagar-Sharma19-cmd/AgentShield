package com.agentshield.agent;

import com.agentshield.dto.AgentCreateResponse;
import com.agentshield.dto.AgentResponse;
import com.agentshield.exception.ConflictException;
import com.agentshield.exception.ResourceNotFoundException;
import com.agentshield.model.AgentStatus;
import com.agentshield.security.ApiKeyGenerator;
import com.agentshield.security.ApiKeyHasher;
import jakarta.persistence.LockModeType;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;

import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Lifecycle rules and the locked lookup they depend on. These are structural checks: they prove which
 * repository method each operation calls and what the service does with the result. Whether two real
 * transactions actually serialize is tested in AgentLifecycleConcurrencyIntegrationTest.
 */
class AgentServiceLifecycleTest {

    private static final String PEPPER = "unit-test-pepper-not-a-secret-0123456789";

    private AgentRepository repository;
    private AgentService service;
    private ApiKeyHasher hasher;
    private UUID id;
    private Agent agent;

    @BeforeEach
    void setUp() {
        repository = mock(AgentRepository.class);
        hasher = new ApiKeyHasher(PEPPER);
        service = new AgentService(repository, new ApiKeyGenerator(), hasher);
        id = UUID.randomUUID();
        agent = new Agent("research-agent", "test");
        when(repository.findByIdForUpdate(id)).thenReturn(Optional.of(agent));
        when(repository.findById(id)).thenReturn(Optional.of(agent));
        when(repository.saveAndFlush(any(Agent.class))).thenAnswer(invocation -> invocation.getArgument(0));
    }

    @Test
    void lockedLookupQueryIsAnnotatedForPessimisticWrite() throws NoSuchMethodException {
        var method = AgentRepository.class.getMethod("findByIdForUpdate", UUID.class);

        Lock lock = method.getAnnotation(Lock.class);
        assertThat(lock).as("findByIdForUpdate must declare a lock").isNotNull();
        assertThat(lock.value()).isEqualTo(LockModeType.PESSIMISTIC_WRITE);
        assertThat(method.getAnnotation(Query.class).value()).contains("a.id = :id");
    }

    @Test
    void updateStatusUsesLockedLookupAndNeverTheUnlockedOne() {
        service.updateStatus(id, AgentStatus.SUSPENDED);

        verify(repository).findByIdForUpdate(id);
        verify(repository, never()).findById(any());
    }

    @Test
    void rotateApiKeyUsesLockedLookupAndNeverTheUnlockedOne() {
        service.rotateApiKey(id);

        verify(repository).findByIdForUpdate(id);
        verify(repository, never()).findById(any());
    }

    @Test
    void readPathStillUsesUnlockedLookup() {
        service.getAgent(id);

        verify(repository).findById(id);
        verify(repository, never()).findByIdForUpdate(any());
    }

    @Test
    void lifecycleOperationOnMissingAgentIsNotFound() {
        UUID missing = UUID.randomUUID();
        when(repository.findByIdForUpdate(missing)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.updateStatus(missing, AgentStatus.SUSPENDED))
                .isInstanceOf(ResourceNotFoundException.class)
                .hasMessage("Agent not found.");
        assertThatThrownBy(() -> service.rotateApiKey(missing))
                .isInstanceOf(ResourceNotFoundException.class)
                .hasMessage("Agent not found.");
    }

    @Test
    void activeToSuspendedKeepsExistingKey() {
        AgentCreateResponse issued = service.rotateApiKey(id);

        AgentResponse response = service.updateStatus(id, AgentStatus.SUSPENDED);

        assertThat(response.status()).isEqualTo(AgentStatus.SUSPENDED);
        assertThat(agent.hasApiKey()).isTrue();
        assertThat(response.apiKeyPrefix()).isEqualTo(issued.apiKeyPrefix());
    }

    @Test
    void suspendedToActiveReactivates() {
        agent.setStatus(AgentStatus.SUSPENDED);

        AgentResponse response = service.updateStatus(id, AgentStatus.ACTIVE);

        assertThat(response.status()).isEqualTo(AgentStatus.ACTIVE);
    }

    @Test
    void revocationClearsKeyMaterial() {
        service.rotateApiKey(id);
        assertThat(agent.hasApiKey()).isTrue();

        AgentResponse response = service.updateStatus(id, AgentStatus.REVOKED);

        assertThat(response.status()).isEqualTo(AgentStatus.REVOKED);
        assertThat(response.apiKeyPrefix()).isNull();
        assertThat(agent.hasApiKey()).isFalse();
    }

    @Test
    void revokedIsTerminalForSuspendAndReactivate() {
        agent.setStatus(AgentStatus.REVOKED);

        assertThatThrownBy(() -> service.updateStatus(id, AgentStatus.SUSPENDED))
                .isInstanceOf(ConflictException.class)
                .hasMessage("A revoked agent cannot be re-activated or suspended.");
        assertThatThrownBy(() -> service.updateStatus(id, AgentStatus.ACTIVE))
                .isInstanceOf(ConflictException.class)
                .hasMessage("A revoked agent cannot be re-activated or suspended.");
        assertThat(agent.getStatus()).isEqualTo(AgentStatus.REVOKED);
    }

    @Test
    void revokingAnAlreadyRevokedAgentIsAllowed() {
        agent.setStatus(AgentStatus.REVOKED);

        AgentResponse response = service.updateStatus(id, AgentStatus.REVOKED);

        assertThat(response.status()).isEqualTo(AgentStatus.REVOKED);
    }

    @Test
    void rotatingARevokedAgentReturnsExistingConflictAndIssuesNoKey() {
        agent.setStatus(AgentStatus.REVOKED);

        assertThatThrownBy(() -> service.rotateApiKey(id))
                .isInstanceOf(ConflictException.class)
                .hasMessage("A revoked agent cannot be issued a new API key.");
        assertThat(agent.hasApiKey()).isFalse();
        verify(repository, never()).saveAndFlush(any());
    }

    @Test
    void rotateIssuesKeyWhoseHashAndPrefixMatchTheStoredValues() {
        AgentCreateResponse response = service.rotateApiKey(id);

        assertThat(response.apiKey()).startsWith(ApiKeyGenerator.KEY_PREFIX);
        assertThat(response.apiKeyPrefix()).isEqualTo(ApiKeyGenerator.displayPrefix(response.apiKey()));
        assertThat(agent.getApiKeyPrefix()).isEqualTo(response.apiKeyPrefix());
        assertThat(agent.hasApiKey()).isTrue();
        assertThat(response.status()).isEqualTo(AgentStatus.ACTIVE);
    }

    @Test
    void rotateOnSuspendedAgentKeepsSuspendedStatus() {
        agent.setStatus(AgentStatus.SUSPENDED);

        AgentCreateResponse response = service.rotateApiKey(id);

        assertThat(response.status()).isEqualTo(AgentStatus.SUSPENDED);
        assertThat(agent.hasApiKey()).isTrue();
    }

    @Test
    void rotateReplacesPreviousKey() {
        AgentCreateResponse first = service.rotateApiKey(id);

        AgentCreateResponse second = service.rotateApiKey(id);

        assertThat(second.apiKey()).isNotEqualTo(first.apiKey());
        assertThat(agent.getApiKeyPrefix()).isEqualTo(second.apiKeyPrefix());
        assertThat(agent.hasApiKey()).isTrue();
    }
}
