package com.agentshield.agent;

import com.agentshield.dto.AgentCreateRequest;
import com.agentshield.dto.AgentCreateResponse;
import com.agentshield.dto.AgentResponse;
import com.agentshield.dto.AgentStatusUpdateRequest;
import jakarta.validation.Valid;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.UUID;

/**
 * Administrative REST API for registering and managing AI agent identities.
 */
@RestController
@RequestMapping("/api/v1/agents")
public class AgentController {

    private final AgentService agentService;

    @Autowired
    public AgentController(AgentService agentService) {
        this.agentService = agentService;
    }

    /**
     * Registers an agent. The response contains the plaintext API key exactly once.
     */
    @PostMapping
    public ResponseEntity<AgentCreateResponse> registerAgent(@Valid @RequestBody AgentCreateRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .cacheControl(CacheControl.noStore())
                .body(agentService.registerAgent(request));
    }

    @GetMapping
    public ResponseEntity<List<AgentResponse>> listAgents() {
        return ResponseEntity.ok(agentService.listAgents());
    }

    @GetMapping("/{id}")
    public ResponseEntity<AgentResponse> getAgent(@PathVariable UUID id) {
        return ResponseEntity.ok(agentService.getAgent(id));
    }

    @PatchMapping("/{id}/status")
    public ResponseEntity<AgentResponse> updateStatus(@PathVariable UUID id,
                                                      @Valid @RequestBody AgentStatusUpdateRequest request) {
        return ResponseEntity.ok(agentService.updateStatus(id, request.status()));
    }

    /**
     * Issues a new API key and invalidates the old one. The response contains the new key exactly once.
     */
    @PostMapping("/{id}/rotate-key")
    public ResponseEntity<AgentCreateResponse> rotateApiKey(@PathVariable UUID id) {
        return ResponseEntity.ok()
                .cacheControl(CacheControl.noStore())
                .body(agentService.rotateApiKey(id));
    }
}
