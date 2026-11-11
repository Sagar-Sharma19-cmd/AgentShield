package com.agentshield.enforcement;

import com.agentshield.dto.DecisionRedeemRequest;
import com.agentshield.dto.DecisionRedeemResponse;
import com.agentshield.security.AuthenticatedAgent;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * POST /api/v1/gateway/decisions/redeem. Under /api/v1/gateway/**, so it uses the existing gateway security
 * chain (agent API key, ROLE_AGENT); an admin key gets 401 there.
 *
 * 200 {requestId, redeemedAt}; 400 malformed body; 401 invalid signature or expired token (or no/bad agent
 * key); 403 another agent's token, a different operation, or an agent that is not ACTIVE; 409 already redeemed.
 */
@RestController
@RequestMapping("/api/v1/gateway/decisions")
public class DecisionController {

    private final DecisionRedemptionService redemptionService;

    public DecisionController(DecisionRedemptionService redemptionService) {
        this.redemptionService = redemptionService;
    }

    @PostMapping("/redeem")
    public ResponseEntity<DecisionRedeemResponse> redeem(@Valid @RequestBody DecisionRedeemRequest request,
                                                         @AuthenticationPrincipal AuthenticatedAgent caller) {
        return ResponseEntity.ok(redemptionService.redeem(caller, request));
    }
}
