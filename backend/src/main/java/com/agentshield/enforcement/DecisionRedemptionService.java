package com.agentshield.enforcement;

import com.agentshield.agent.AgentRepository;
import com.agentshield.dto.DecisionRedeemRequest;
import com.agentshield.dto.DecisionRedeemResponse;
import com.agentshield.exception.ConflictException;
import com.agentshield.exception.DecisionTokenForbiddenException;
import com.agentshield.inspection.ArgumentLimits;
import com.agentshield.inspection.PreparedArguments;
import com.agentshield.model.AgentStatus;
import com.agentshield.security.AuthenticatedAgent;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.time.Clock;
import java.time.Instant;

/**
 * Redeems a decision token once, just before the agent runs the operation. In order:
 * 1. signature and expiry (401, DecisionTokenService),
 * 2. the token's sub is the authenticated caller, and the caller is still ACTIVE (403),
 * 3. tool, action and SHA-256(resource) in the body equal the token's (403), and (Phase V13) the arguments:
 *    a token with an "args" claim needs the same arguments in the body; a token without one accepts no
 *    arguments, because arguments the gateway never inspected must not ride on its decision (403),
 * 4. one INSERT of the jti (409 if it was already redeemed; the primary key decides under concurrency).
 *
 * Nothing about the original decision is re-evaluated: the token is the gateway's decision. A suspended agent
 * cannot redeem, so suspension also stops operations decided in the last ttl-seconds.
 */
@Service
public class DecisionRedemptionService {

    private static final Logger log = LoggerFactory.getLogger(DecisionRedemptionService.class);

    private final DecisionTokenService tokenService;
    private final DecisionRedemptionStore store;
    private final AgentRepository agentRepository;
    private final Clock clock;
    private final ArgumentLimits argumentLimits;

    public DecisionRedemptionService(DecisionTokenService tokenService, DecisionRedemptionStore store,
                                     AgentRepository agentRepository, Clock clock, ArgumentLimits argumentLimits) {
        this.tokenService = tokenService;
        this.store = store;
        this.agentRepository = agentRepository;
        this.clock = clock;
        this.argumentLimits = argumentLimits;
    }

    public DecisionRedeemResponse redeem(AuthenticatedAgent caller, DecisionRedeemRequest request) {
        DecisionTokenClaims claims = tokenService.verify(request.token());

        if (caller == null || !claims.agentId().equals(caller.id())) {
            throw new DecisionTokenForbiddenException("This decision token was issued to another agent.");
        }
        boolean active = agentRepository.findById(caller.id())
                .map(agent -> agent.getStatus() == AgentStatus.ACTIVE)
                .orElse(false);
        if (!active) {
            throw new DecisionTokenForbiddenException("The agent is not active, so it cannot redeem decisions.");
        }
        boolean sameOperation = claims.tool().equals(request.tool())
                && claims.action() == request.action()
                && claims.resourceHash().equals(DecisionTokenService.sha256Hex(request.resource()));
        if (!sameOperation) {
            throw new DecisionTokenForbiddenException(
                    "This decision token was issued for a different tool, action or resource.");
        }
        PreparedArguments arguments = argumentLimits.prepare(request.arguments());
        String argsHash = arguments == null ? null : arguments.sha256();
        if (!java.util.Objects.equals(claims.argsHash(), argsHash)) {
            throw new DecisionTokenForbiddenException(claims.argsHash() == null
                    ? "This decision token was issued without arguments, so it cannot be redeemed with arguments."
                    : "This decision token was issued for different arguments.");
        }

        Instant redeemedAt = clock.instant();
        if (!store.insertOnce(claims.requestId(), caller.id(), claims.tool(), claims.action().name(),
                claims.resourceHash(), redeemedAt)) {
            throw new ConflictException("This decision was already redeemed. A decision can be used once.");
        }
        log.info("Decision {} ({}) redeemed by agent {}.", claims.requestId(), claims.source(), caller.id());
        return new DecisionRedeemResponse(claims.requestId(), redeemedAt);
    }
}
