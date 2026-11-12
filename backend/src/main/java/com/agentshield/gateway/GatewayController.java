package com.agentshield.gateway;

import com.agentshield.dto.EvaluationRequest;
import com.agentshield.dto.EvaluationResponse;
import com.agentshield.dto.InspectOutputRequest;
import com.agentshield.dto.InspectOutputResponse;
import com.agentshield.inspection.OutputInspectionService;
import com.agentshield.security.AuthenticatedAgent;
import jakarta.validation.Valid;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * REST Controller hosting the runtime security gateway evaluation endpoint.
 * Requests are authenticated with an agent API key before reaching this controller.
 */
@RestController
@RequestMapping("/api/v1/gateway")
public class GatewayController {

    private final GatewayService gatewayService;
    private final OutputInspectionService outputInspectionService;

    @Autowired
    public GatewayController(GatewayService gatewayService, OutputInspectionService outputInspectionService) {
        this.gatewayService = gatewayService;
        this.outputInspectionService = outputInspectionService;
    }

    @PostMapping("/evaluate")
    public ResponseEntity<EvaluationResponse> evaluate(@Valid @RequestBody EvaluationRequest request,
                                                       @AuthenticationPrincipal AuthenticatedAgent caller) {
        EvaluationResponse response = gatewayService.evaluateRequest(request, caller);
        return ResponseEntity.ok(response);
    }

    /**
     * Output scanning (Phase V13): {sessionId, tool, content} (content up to 256 KB) -> {requestId, verdict,
     * findings, redactedContent}. Same agent API-key authentication as evaluate; 403 for an agent that is not
     * ACTIVE. Records one audit row (READ, output:<tool>) with the redacted findings, never the content.
     */
    @PostMapping("/inspect")
    public ResponseEntity<InspectOutputResponse> inspect(@Valid @RequestBody InspectOutputRequest request,
                                                         @AuthenticationPrincipal AuthenticatedAgent caller) {
        return ResponseEntity.ok(outputInspectionService.inspect(request, caller));
    }
}
