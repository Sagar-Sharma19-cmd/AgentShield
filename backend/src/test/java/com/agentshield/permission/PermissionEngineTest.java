package com.agentshield.permission;

import com.agentshield.agent.Agent;
import com.agentshield.agent.AgentRepository;
import com.agentshield.model.ActionType;
import com.agentshield.model.AgentStatus;
import com.agentshield.model.AuthorizationResult;
import com.agentshield.model.ToolStatus;
import com.agentshield.model.ToolType;
import com.agentshield.security.AuthenticatedAgent;
import com.agentshield.tool.Tool;
import com.agentshield.tool.ToolRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.ActiveProfiles;

import java.util.Set;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

@DataJpaTest
@Import(PermissionEngine.class)
@ActiveProfiles("test")
class PermissionEngineTest {

    @Autowired
    private PermissionEngine permissionEngine;

    @Autowired
    private AgentRepository agentRepository;

    @Autowired
    private ToolRepository toolRepository;

    @Autowired
    private AgentToolPermissionRepository permissionRepository;

    private Agent agent;
    private Tool filesystem;

    @BeforeEach
    void setUp() {
        agent = agentRepository.save(new Agent("research-agent", null));
        filesystem = toolRepository.save(new Tool("filesystem", null, ToolType.FILESYSTEM));
    }

    @Test
    @DisplayName("Permission 10. Authorized READ -> AUTHORIZED")
    void testAuthorizedRead() {
        grant(Set.of(ActionType.READ), true);

        AuthorizationDecision decision = permissionEngine.authorize(caller(), "research-agent", "filesystem", ActionType.READ);

        assertTrue(decision.isAuthorized());
        assertEquals(AuthorizationResult.AUTHORIZED, decision.result());
        assertEquals(agent.getId(), decision.agentId());
        assertEquals(filesystem.getId(), decision.toolId());
    }

    @Test
    @DisplayName("Claimed agentId may be the caller's UUID as well as its name")
    void testClaimByUuid() {
        grant(Set.of(ActionType.READ), true);

        AuthorizationDecision decision = permissionEngine.authorize(caller(), agent.getId().toString(), "filesystem", ActionType.READ);

        assertEquals(AuthorizationResult.AUTHORIZED, decision.result());
    }

    @Test
    @DisplayName("Permission 11. READ without any grant -> UNAUTHORIZED")
    void testReadWithoutPermission() {
        AuthorizationDecision decision = permissionEngine.authorize(caller(), "research-agent", "filesystem", ActionType.READ);

        assertFalse(decision.isAuthorized());
        assertEquals(AuthorizationResult.UNAUTHORIZED, decision.result());
    }

    @Test
    @DisplayName("Permission 12. WRITE not in grant -> UNAUTHORIZED")
    void testWriteWithoutPermission() {
        grant(Set.of(ActionType.READ), true);

        AuthorizationDecision decision = permissionEngine.authorize(caller(), "research-agent", "filesystem", ActionType.WRITE);

        assertEquals(AuthorizationResult.UNAUTHORIZED, decision.result());
    }

    @Test
    @DisplayName("Permission 13. DELETE not in grant -> UNAUTHORIZED")
    void testDeleteWithoutPermission() {
        grant(Set.of(ActionType.READ, ActionType.WRITE), true);

        AuthorizationDecision decision = permissionEngine.authorize(caller(), "research-agent", "filesystem", ActionType.DELETE);

        assertEquals(AuthorizationResult.UNAUTHORIZED, decision.result());
    }

    @Test
    @DisplayName("Permission 14. Disabled grant -> PERMISSION_DISABLED even for granted action")
    void testPermissionDisabled() {
        grant(Set.of(ActionType.READ), false);

        AuthorizationDecision decision = permissionEngine.authorize(caller(), "research-agent", "filesystem", ActionType.READ);

        assertEquals(AuthorizationResult.PERMISSION_DISABLED, decision.result());
    }

    @Test
    @DisplayName("Grant on one tool does not authorize another tool")
    void testGrantIsScopedToTool() {
        grant(Set.of(ActionType.READ), true);
        toolRepository.save(new Tool("database", null, ToolType.DATABASE));

        AuthorizationDecision decision = permissionEngine.authorize(caller(), "research-agent", "database", ActionType.READ);

        assertEquals(AuthorizationResult.UNAUTHORIZED, decision.result());
    }

    @Test
    @DisplayName("Authenticated principal no longer registered -> AGENT_NOT_FOUND")
    void testAgentNotFound() {
        AuthenticatedAgent ghost = new AuthenticatedAgent(UUID.randomUUID(), "ghost-agent");

        AuthorizationDecision decision = permissionEngine.authorize(ghost, "ghost-agent", "filesystem", ActionType.READ);

        assertEquals(AuthorizationResult.AGENT_NOT_FOUND, decision.result());
        assertNull(decision.agentId());
    }

    @Test
    @DisplayName("Caller claiming another agent's identity -> AGENT_IDENTITY_MISMATCH, even if that agent is authorized")
    void testIdentityMismatch() {
        Agent other = agentRepository.save(new Agent("privileged-agent", null));
        permissionRepository.save(new AgentToolPermission(other, filesystem, Set.of(ActionType.READ), true));

        AuthorizationDecision byName = permissionEngine.authorize(caller(), "privileged-agent", "filesystem", ActionType.READ);
        AuthorizationDecision byUuid = permissionEngine.authorize(caller(), other.getId().toString(), "filesystem", ActionType.READ);

        assertEquals(AuthorizationResult.AGENT_IDENTITY_MISMATCH, byName.result());
        assertEquals(AuthorizationResult.AGENT_IDENTITY_MISMATCH, byUuid.result());
        assertEquals(agent.getId(), byName.agentId());
    }

    @Test
    @DisplayName("Unknown tool -> TOOL_NOT_FOUND")
    void testToolNotFound() {
        AuthorizationDecision decision = permissionEngine.authorize(caller(), "research-agent", "ghost-tool", ActionType.READ);

        assertEquals(AuthorizationResult.TOOL_NOT_FOUND, decision.result());
        assertEquals(agent.getId(), decision.agentId());
        assertNull(decision.toolId());
    }

    @Test
    @DisplayName("Suspended agent -> AGENT_SUSPENDED even with valid grant")
    void testAgentSuspended() {
        grant(Set.of(ActionType.READ), true);
        agent.setStatus(AgentStatus.SUSPENDED);
        agentRepository.save(agent);

        assertEquals(AuthorizationResult.AGENT_SUSPENDED,
                permissionEngine.authorize(caller(), "research-agent", "filesystem", ActionType.READ).result());
    }

    @Test
    @DisplayName("Revoked agent -> AGENT_REVOKED even with valid grant")
    void testAgentRevoked() {
        grant(Set.of(ActionType.READ), true);
        agent.setStatus(AgentStatus.REVOKED);
        agentRepository.save(agent);

        assertEquals(AuthorizationResult.AGENT_REVOKED,
                permissionEngine.authorize(caller(), "research-agent", "filesystem", ActionType.READ).result());
    }

    @Test
    @DisplayName("Disabled tool -> TOOL_DISABLED even with valid grant")
    void testToolDisabled() {
        grant(Set.of(ActionType.READ), true);
        filesystem.setStatus(ToolStatus.DISABLED);
        toolRepository.save(filesystem);

        assertEquals(AuthorizationResult.TOOL_DISABLED,
                permissionEngine.authorize(caller(), "research-agent", "filesystem", ActionType.READ).result());
    }

    @Test
    @DisplayName("Blank / null identifiers -> denied, never authorized")
    void testNullInputsDenied() {
        grant(Set.of(ActionType.READ), true);

        assertEquals(AuthorizationResult.AGENT_NOT_FOUND, permissionEngine.authorize(null, "research-agent", "filesystem", ActionType.READ).result());
        assertEquals(AuthorizationResult.AGENT_IDENTITY_MISMATCH, permissionEngine.authorize(caller(), null, "filesystem", ActionType.READ).result());
        assertEquals(AuthorizationResult.TOOL_NOT_FOUND, permissionEngine.authorize(caller(), "research-agent", null, ActionType.READ).result());
        assertEquals(AuthorizationResult.UNAUTHORIZED, permissionEngine.authorize(caller(), "research-agent", "filesystem", null).result());
    }

    private AuthenticatedAgent caller() {
        return new AuthenticatedAgent(agent.getId(), agent.getName());
    }

    private void grant(Set<ActionType> actions, boolean enabled) {
        permissionRepository.save(new AgentToolPermission(agent, filesystem, actions, enabled));
    }
}
