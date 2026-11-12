package com.agentshield.inspection;

import com.agentshield.agent.AgentRepository;
import com.agentshield.audit.AuditService;
import com.agentshield.dto.InspectOutputRequest;
import com.agentshield.dto.InspectOutputResponse;
import com.agentshield.exception.AgentNotActiveException;
import com.agentshield.model.AgentStatus;
import com.agentshield.model.DecisionType;
import com.agentshield.model.EscalationSource;
import com.agentshield.model.ResourceSensitivity;
import com.agentshield.policy.PolicyEvaluationResult;
import com.agentshield.security.AuthenticatedAgent;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;
import java.util.UUID;

/**
 * Output scanning (POST /api/v1/gateway/inspect, Phase V13): inspects what a tool returned before an agent (or the
 * MCP proxy) hands it to a model. Nothing is executed or granted, so no tool permission is checked; the caller must
 * be an authenticated, ACTIVE agent.
 *
 * One audit row per call: action READ, resource {@code output:<tool>}, decision ALLOW (CLEAN), REVIEW or DENY from
 * the verdict, escalatedBy INSPECTION when it is not CLEAN, and the redacted findings. The content is never stored
 * or logged; the response carries it back only in redacted form.
 */
@Service
public class OutputInspectionService {

    static final String LOCATION = "content";

    private final ContentInspector contentInspector;
    private final AuditService auditService;
    private final AgentRepository agentRepository;
    private final Clock clock;

    public OutputInspectionService(ContentInspector contentInspector, AuditService auditService,
                                   AgentRepository agentRepository, Clock clock) {
        this.contentInspector = contentInspector;
        this.auditService = auditService;
        this.agentRepository = agentRepository;
        this.clock = clock;
    }

    @Transactional
    public InspectOutputResponse inspect(InspectOutputRequest request, AuthenticatedAgent caller) {
        boolean active = caller != null && agentRepository.findById(caller.id())
                .map(agent -> agent.getStatus() == AgentStatus.ACTIVE)
                .orElse(false);
        if (!active) {
            throw new AgentNotActiveException("The agent is not active, so it cannot inspect output.");
        }

        TextInspection scan = contentInspector.inspectText(request.content(), LOCATION);
        InspectionResult result = contentInspector.enabled()
                ? new InspectionResult(scan.verdict(), scan.findings(), scan.totalFindings())
                : InspectionResult.NOT_INSPECTED;

        UUID requestId = UUID.randomUUID();
        Instant timestamp = clock.instant();
        auditService.recordOutputInspection(requestId, caller.name(), caller.id(), request.sessionId(), request.tool(),
                decisionFor(result), result.verdict() == null || result.verdict() == InspectionVerdict.CLEAN
                        ? EscalationSource.NONE : EscalationSource.INSPECTION,
                result, timestamp);
        return new InspectOutputResponse(requestId, scan.verdict(), scan.findings(), scan.redactedContent());
    }

    static PolicyEvaluationResult decisionFor(InspectionResult result) {
        InspectionVerdict verdict = result.verdict() == null ? InspectionVerdict.CLEAN : result.verdict();
        return switch (verdict) {
            case CLEAN -> PolicyEvaluationResult.builder()
                    .decision(DecisionType.ALLOW)
                    .reason(result.inspected() ? "Tool output inspected: no sensitive content found."
                            : "Tool output was not inspected (content inspection is disabled).")
                    .riskScore(0)
                    .resourceSensitivity(ResourceSensitivity.INTERNAL)
                    .build();
            case REVIEW -> PolicyEvaluationResult.builder()
                    .decision(DecisionType.REVIEW)
                    .reason(outputSentence(result) + " It was redacted before being returned.")
                    .riskScore(60)
                    .resourceSensitivity(ResourceSensitivity.SENSITIVE)
                    .build();
            case DENY -> PolicyEvaluationResult.builder()
                    .decision(DecisionType.DENY)
                    .reason(outputSentence(result) + " Secrets must not be passed back to a model; it was redacted.")
                    .riskScore(90)
                    .resourceSensitivity(ResourceSensitivity.CRITICAL)
                    .build();
        };
    }

    private static String outputSentence(InspectionResult result) {
        Finding lead = InspectionReasons.leading(result.findings());
        int more = result.totalFindings() - 1;
        return "Tool output contains " + InspectionReasons.label(lead.type())
                + (more > 0 ? " (and " + more + " more finding" + (more == 1 ? "" : "s") + ")." : ".");
    }
}
