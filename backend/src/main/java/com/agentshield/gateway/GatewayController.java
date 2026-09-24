package com.agentshield.gateway;

import com.agentshield.dto.EvaluationRequest;
import com.agentshield.dto.EvaluationResponse;
import jakarta.validation.Valid;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * REST Controller hosting the runtime security gateway evaluation endpoint.
 */
@RestController
@RequestMapping("/api/v1/gateway")
public class GatewayController {

    private final GatewayService gatewayService;

    @Autowired
    public GatewayController(GatewayService gatewayService) {
        this.gatewayService = gatewayService;
    }

    @PostMapping("/evaluate")
    public ResponseEntity<EvaluationResponse> evaluate(@Valid @RequestBody EvaluationRequest request) {
        EvaluationResponse response = gatewayService.evaluateRequest(request);
        return ResponseEntity.ok(response);
    }
}
