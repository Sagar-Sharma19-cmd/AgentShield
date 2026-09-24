package com.agentshield.permission;

import com.agentshield.dto.PermissionCreateRequest;
import com.agentshield.dto.PermissionResponse;
import jakarta.validation.Valid;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.UUID;

/**
 * Administrative REST API for granting and revoking agent-tool permissions.
 */
@RestController
@RequestMapping("/api/v1/permissions")
public class PermissionController {

    private final PermissionService permissionService;

    @Autowired
    public PermissionController(PermissionService permissionService) {
        this.permissionService = permissionService;
    }

    @PostMapping
    public ResponseEntity<PermissionResponse> grantPermission(@Valid @RequestBody PermissionCreateRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(permissionService.grantPermission(request));
    }

    @GetMapping("/agent/{agentId}")
    public ResponseEntity<List<PermissionResponse>> getPermissionsForAgent(@PathVariable UUID agentId) {
        return ResponseEntity.ok(permissionService.getPermissionsForAgent(agentId));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> revokePermission(@PathVariable UUID id) {
        permissionService.revokePermission(id);
        return ResponseEntity.noContent().build();
    }
}
