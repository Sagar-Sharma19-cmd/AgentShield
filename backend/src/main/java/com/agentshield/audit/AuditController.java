package com.agentshield.audit;

import com.agentshield.dto.AuditLogPageResponse;
import com.agentshield.dto.AuditLogResponse;
import com.agentshield.model.AuthorizationResult;
import com.agentshield.model.DecisionType;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.Instant;
import java.util.UUID;

/**
 * Read-only administrative API over audit_logs (Phase 4). There is no write endpoint here:
 * every row is created exclusively by GatewayService via AuditService.recordEvaluation.
 * Secured by the existing admin API key convention (see SecurityConfig) — an agent API key
 * is never accepted here, matching the reviews/agents/tools/permissions admin chain.
 */
@RestController
@RequestMapping("/api/v1/audit")
@Validated
public class AuditController {

    static final int MAX_PAGE_SIZE = 100;
    static final int DEFAULT_PAGE_SIZE = 20;

    private final AuditService auditService;

    @Autowired
    public AuditController(AuditService auditService) {
        this.auditService = auditService;
    }

    /** Correlation lookup: resolves the single audit row for a gateway requestId. */
    @GetMapping("/{requestId}")
    public ResponseEntity<AuditLogResponse> getByRequestId(@PathVariable UUID requestId) {
        return ResponseEntity.ok(AuditLogResponse.from(auditService.getByRequestId(requestId)));
    }

    /**
     * Paginated, filterable list. Sort order is always timestamp DESC — there is no
     * client-controlled sort parameter, so arbitrary entity fields can never become sort
     * expressions.
     */
    @GetMapping
    public ResponseEntity<AuditLogPageResponse> listAuditLogs(
            @RequestParam(required = false) String agentId,
            @RequestParam(required = false) DecisionType decision,
            @RequestParam(required = false) AuthorizationResult authorizationResult,
            @RequestParam(required = false) Instant from,
            @RequestParam(required = false) Instant to,
            @RequestParam(defaultValue = "0") @Min(0) int page,
            @RequestParam(defaultValue = "" + DEFAULT_PAGE_SIZE) @Min(1) @Max(MAX_PAGE_SIZE) int size) {
        return ResponseEntity.ok(AuditLogPageResponse.from(
                auditService.search(agentId, decision, authorizationResult, from, to, page, size)));
    }
}
