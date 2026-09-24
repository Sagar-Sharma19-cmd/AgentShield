package com.agentshield.tool;

import com.agentshield.dto.ToolCreateRequest;
import com.agentshield.dto.ToolResponse;
import com.agentshield.dto.ToolStatusUpdateRequest;
import jakarta.validation.Valid;
import org.springframework.beans.factory.annotation.Autowired;
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
 * Administrative REST API for the tool registry.
 */
@RestController
@RequestMapping("/api/v1/tools")
public class ToolController {

    private final ToolService toolService;

    @Autowired
    public ToolController(ToolService toolService) {
        this.toolService = toolService;
    }

    @PostMapping
    public ResponseEntity<ToolResponse> registerTool(@Valid @RequestBody ToolCreateRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(toolService.registerTool(request));
    }

    @GetMapping
    public ResponseEntity<List<ToolResponse>> listTools() {
        return ResponseEntity.ok(toolService.listTools());
    }

    @GetMapping("/{id}")
    public ResponseEntity<ToolResponse> getTool(@PathVariable UUID id) {
        return ResponseEntity.ok(toolService.getTool(id));
    }

    @PatchMapping("/{id}/status")
    public ResponseEntity<ToolResponse> updateStatus(@PathVariable UUID id,
                                                     @Valid @RequestBody ToolStatusUpdateRequest request) {
        return ResponseEntity.ok(toolService.updateStatus(id, request.status()));
    }
}
