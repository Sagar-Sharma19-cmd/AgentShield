package com.agentshield.tool;

import com.agentshield.dto.ToolCreateRequest;
import com.agentshield.dto.ToolResponse;
import com.agentshield.exception.ConflictException;
import com.agentshield.exception.ResourceNotFoundException;
import com.agentshield.model.ToolStatus;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

/**
 * Service managing the tool registry.
 */
@Service
public class ToolService {

    private final ToolRepository toolRepository;

    @Autowired
    public ToolService(ToolRepository toolRepository) {
        this.toolRepository = toolRepository;
    }

    @Transactional
    public ToolResponse registerTool(ToolCreateRequest request) {
        if (toolRepository.existsByName(request.name())) {
            throw new ConflictException("A tool with this name is already registered.");
        }
        Tool tool = toolRepository.save(new Tool(request.name(), request.description(), request.toolType()));
        return ToolResponse.from(tool);
    }

    @Transactional(readOnly = true)
    public List<ToolResponse> listTools() {
        return toolRepository.findAll(Sort.by("createdAt")).stream()
                .map(ToolResponse::from)
                .toList();
    }

    @Transactional(readOnly = true)
    public ToolResponse getTool(UUID id) {
        return ToolResponse.from(findTool(id));
    }

    @Transactional
    public ToolResponse updateStatus(UUID id, ToolStatus newStatus) {
        Tool tool = findTool(id);
        tool.setStatus(newStatus);
        return ToolResponse.from(toolRepository.saveAndFlush(tool));
    }

    private Tool findTool(UUID id) {
        return toolRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Tool not found."));
    }
}
