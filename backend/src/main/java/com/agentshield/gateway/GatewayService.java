package com.agentshield.gateway;

import com.agentshield.audit.AuditService;
import com.agentshield.dto.EvaluationRequest;
import com.agentshield.dto.EvaluationResponse;
import com.agentshield.enforcement.DecisionSource;
import com.agentshield.enforcement.DecisionTokenService;
import com.agentshield.inspection.ArgumentLimits;
import com.agentshield.inspection.ContentInspector;
import com.agentshield.inspection.FindingCategory;
import com.agentshield.inspection.InspectionReasons;
import com.agentshield.inspection.InspectionResult;
import com.agentshield.inspection.InspectionVerdict;
import com.agentshield.inspection.PreparedArguments;
import com.agentshield.model.DecisionType;
import com.agentshield.model.EscalationSource;
import com.agentshield.model.ResourceSensitivity;
import com.agentshield.model.RiskTier;
import com.agentshield.permission.AuthorizationDecision;
import com.agentshield.permission.PermissionEngine;
import com.agentshield.policy.PolicyEngine;
import com.agentshield.policy.PolicyEvaluationResult;
import com.agentshield.review.ReviewRequest;
import com.agentshield.review.ReviewRequestService;
import com.agentshield.riskengine.RiskAssessment;
import com.agentshield.riskengine.RiskAssessmentService;
import com.agentshield.riskengine.RiskEngineClient;
import com.agentshield.security.AuthenticatedAgent;
import com.agentshield.trajectory.TrajectoryEvaluation;
import com.agentshield.trajectory.TrajectoryEvent;
import com.agentshield.trajectory.TrajectoryService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

/**
 * Primary orchestration service for AgentShield Security Gateway.
 *
 * Decision hierarchy:
 * 0. API key authentication (Spring Security filter) — failure is HTTP 401 before this service runs.
 * 1. PermissionEngine (identity claim, tool registry, explicit grant) — any failure is a final DENY.
 *    The Risk Engine is never consulted for an unauthorized request.
 * 1b. ContentInspector (Phase V13, V13.1) — runs for every authorized request: the resource always, the optional
 *    "arguments" when sent. A secret in the arguments or resource is a final DENY like a policy DENY: audited, the Risk Engine is not called and no
 *    token is issued. PII or prompt injection is REVIEW, combined with the policy decision escalate-only (the
 *    stricter wins); escalatedBy is INSPECTION when inspection raised the decision. The arguments themselves are
 *    never persisted, logged or echoed; only redacted findings and (for tokens and reviews) a SHA-256.
 * 2. PolicyEngine (resource/action risk) — runs only for authorized requests and can only
 *    ALLOW, REVIEW or DENY what authorization already permitted; it can never grant access.
 *    A policy DENY is final — the Risk Engine is not consulted (it could not downgrade it anyway).
 * 3. RiskEngineClient — consulted only when the policy decision is ALLOW or REVIEW. Its risk
 *    tier can only escalate that decision (see DecisionEscalator); it can never grant or
 *    downgrade authorization. A Risk Engine failure/timeout escalates in risk terms (fails
 *    safely to HIGH/REVIEW territory) rather than failing open.
 * 4. ReviewRequestService (Phase 3) — when, and only when, the final decision is REVIEW, a
 *    persistent review request is created for a human operator to later APPROVE or REJECT.
 *    ALLOW and DENY never create a review request, and the review workflow cannot turn a
 *    DENY into an ALLOW — it only ever handles requests that already reached REVIEW.
 */
@Service
public class GatewayService {

    /** Risk score recorded when a request is denied by authorization (fail-closed maximum). */
    static final int AUTHORIZATION_DENIAL_RISK_SCORE = 100;
    /** Risk score recorded when content inspection denies a request (a secret), the same as a policy secret DENY. */
    static final int INSPECTION_DENIAL_RISK_SCORE = 90;

    private final PermissionEngine permissionEngine;
    private final PolicyEngine policyEngine;
    private final AuditService auditService;
    private final RiskEngineClient riskEngineClient;
    private final DecisionEscalator decisionEscalator;
    private final RiskAssessmentService riskAssessmentService;
    private final ReviewRequestService reviewRequestService;
    private final TrajectoryService trajectoryService;
    private final DecisionTokenService decisionTokenService;
    private final ArgumentLimits argumentLimits;
    private final ContentInspector contentInspector;

    @Autowired
    public GatewayService(PermissionEngine permissionEngine, PolicyEngine policyEngine, AuditService auditService,
                          RiskEngineClient riskEngineClient, DecisionEscalator decisionEscalator,
                          RiskAssessmentService riskAssessmentService, ReviewRequestService reviewRequestService,
                          TrajectoryService trajectoryService, DecisionTokenService decisionTokenService,
                          ArgumentLimits argumentLimits, ContentInspector contentInspector) {
        this.argumentLimits = argumentLimits;
        this.contentInspector = contentInspector;
        this.permissionEngine = permissionEngine;
        this.policyEngine = policyEngine;
        this.auditService = auditService;
        this.riskEngineClient = riskEngineClient;
        this.decisionEscalator = decisionEscalator;
        this.riskAssessmentService = riskAssessmentService;
        this.reviewRequestService = reviewRequestService;
        this.trajectoryService = trajectoryService;
        this.decisionTokenService = decisionTokenService;
    }

    /**
     * One transaction for the whole write path: the risk assessment, the audit row and (for REVIEW) the
     * review request are committed together or not at all, so a failure part-way never leaves a risk
     * assessment or audit row without the rest. A request that fails is answered with an error, never a
     * decision. Trajectory's history read deliberately runs outside this transaction (see TrajectoryService).
     */
    @Transactional
    public EvaluationResponse evaluateRequest(EvaluationRequest request, AuthenticatedAgent caller) {
        // Size, depth and type limits on the optional arguments (400 before anything is decided or stored).
        PreparedArguments arguments = argumentLimits.prepare(request.getArguments());
        String argsHash = arguments == null ? null : arguments.sha256();

        UUID requestId = UUID.randomUUID();
        Instant timestamp = Instant.now();

        // 1. Authorize the authenticated agent: identity claim, tool registration and explicit permission grant
        AuthorizationDecision authorization = permissionEngine.authorize(
                caller, request.getAgentId(), request.getTool(), request.getAction());

        if (!authorization.isAuthorized()) {
            // Permission denial is authoritative: the Risk Engine is never called.
            PolicyEvaluationResult denial = authorizationDenial(authorization);
            auditService.recordEvaluation(request, requestId, denial, authorization, timestamp);
            return buildResponse(requestId, request, denial, authorization, null, null, null, null, null, timestamp);
        }

        // 1b. Content inspection of the resource and any arguments. A secret is a final DENY, like a policy DENY.
        InspectionResult inspection = contentInspector.inspect(arguments, request.getResource());
        if (inspection.verdict() == InspectionVerdict.DENY) {
            PolicyEvaluationResult denial = inspectionDenial(inspection);
            auditService.recordEvaluation(request, storedResource(request, inspection), requestId, denial,
                    authorization, timestamp, null, EscalationSource.INSPECTION, inspection);
            return withInspection(buildResponse(requestId, request, denial, authorization, null, null, null, null,
                    null, timestamp), inspection);
        }

        // 2. Evaluate security policy rules for the authorized request
        PolicyEvaluationResult policyResult = policyEngine.evaluate(request);

        if (policyResult.getDecision() == DecisionType.DENY) {
            // Policy denial is authoritative: the Risk Engine cannot downgrade it, so it is
            // not consulted.
            auditService.recordEvaluation(request, request.getResource(), requestId, policyResult, authorization,
                    timestamp, null, EscalationSource.NONE, inspection);
            return withInspection(buildResponse(requestId, request, policyResult, authorization, null, null, null,
                    null, null, timestamp), inspection);
        }

        // 2b. An inspection REVIEW (PII, prompt injection) raises a policy ALLOW to REVIEW. Escalate-only.
        DecisionType inspectedDecision = decisionEscalator.combineInspection(policyResult.getDecision(),
                inspection.verdict());
        PolicyEvaluationResult inspectedResult = withInspectionEscalation(policyResult, inspectedDecision, inspection);

        // 3. Risk Engine is an escalation-only signal for ALLOW/REVIEW policy outcomes.
        RiskAssessment riskAssessment = riskEngineClient.assessRisk(
                request.getAction(), request.getResource(), policyResult.getResourceSensitivity());
        riskAssessmentService.persist(requestId, riskAssessment, timestamp);

        DecisionType riskDecision = decisionEscalator.combine(inspectedDecision, riskAssessment.riskTier());
        PolicyEvaluationResult riskResult = withEscalatedDecision(inspectedResult, riskDecision, riskAssessment);

        // 3b. Trajectory analysis is a second, escalate-only signal over this session's recent history.
        //     It only runs when the decision is not already DENY, and it never produces DENY.
        //     Empty means not evaluated (no verified agent, or the history query failed). The decision is then unchanged.
        Optional<TrajectoryEvaluation> trajectory = riskDecision == DecisionType.DENY
                ? Optional.empty()
                : trajectoryService.evaluate(requestId, request.getSessionId(), authorization.agentId(),
                        TrajectoryEvent.candidate(timestamp, request.getAction(), request.getTool(),
                                policyResult.getResourceSensitivity(), policyResult.getDecision()));
        DecisionType finalDecision = trajectory
                .map(t -> decisionEscalator.combineTrajectory(riskDecision, t.tier()))
                .orElse(riskDecision);
        PolicyEvaluationResult finalResult = withTrajectoryEscalation(riskResult, finalDecision, trajectory.orElse(null));

        // 4. Audit the final (possibly escalated) decision, with its trajectory result and attribution
        EscalationSource escalatedBy = escalationSource(policyResult.getDecision(), inspectedDecision, riskDecision,
                finalDecision);
        auditService.recordEvaluation(request, request.getResource(), requestId, finalResult, authorization, timestamp,
                trajectory.orElse(null), escalatedBy, inspection, riskAssessment);

        // 5. Final decision REVIEW -> persist a human review request (Phase 3). ALLOW/DENY never do.
        //    The Risk Engine's score and tier are passed unchanged. The review row stores the effective
        //    values and the trajectory signal separately. Ownership is the VERIFIED registered agent id,
        //    never the agentId the client claimed, so only that agent can later read or claim the review.
        //    The review stores the same escalation attribution as the audit row (V11).
        UUID reviewRequestId = null;
        if (finalDecision == DecisionType.REVIEW) {
            ReviewRequest reviewRequest = reviewRequestService.createReviewRequest(requestId, request,
                    policyResult.getResourceSensitivity(), riskAssessment.riskScore(), riskAssessment.riskTier(),
                    policyResult.getDecision(), finalResult.getReason(), timestamp, trajectory.orElse(null),
                    authorization.agentId(), escalatedBy, inspection.findingsOrNull(), argsHash);
            reviewRequestId = reviewRequest.getId();
        }

        EvaluationResponse response = buildResponse(requestId, request, finalResult, authorization,
                riskAssessment.riskTier(), riskAssessment.engineAvailable(), riskAssessment.riskScore(),
                trajectory.map(TrajectoryEvaluation::score).orElse(null), reviewRequestId, timestamp);
        withInspection(response, inspection);

        // 6. Final ALLOW -> a signed one-time decision token for exactly this operation (Phase E1). It is
        //    issued after every stage has decided, so it never changes a decision; REVIEW and DENY get none.
        //    The subject is the VERIFIED registered agent id, never the claimed agentId.
        if (finalDecision == DecisionType.ALLOW) {
            response.setDecisionToken(decisionTokenService.issue(requestId, authorization.agentId(),
                    request.getTool(), request.getAction(), request.getResource(), DecisionSource.ALLOW, argsHash));
        }
        return response;
    }

    /**
     * Attributes the final decision to the signal that changed it. Each stage can only escalate:
     * a change from the policy decision is the Risk Engine's; a change from an ALLOW to REVIEW
     * after that is trajectory's. Any REVIEW or DENY that already existed is never attributed to
     * trajectory.
     */
    static EscalationSource escalationSource(DecisionType policyDecision, DecisionType riskDecision,
                                             DecisionType finalDecision) {
        if (riskDecision != policyDecision) {
            return EscalationSource.RISK_ENGINE;
        }
        if (riskDecision == DecisionType.ALLOW && finalDecision == DecisionType.REVIEW) {
            return EscalationSource.TRAJECTORY;
        }
        return EscalationSource.NONE;
    }

    /**
     * As {@link #escalationSource(DecisionType, DecisionType, DecisionType)}, with content inspection between policy
     * and the Risk Engine: a Risk Engine change wins; otherwise a change from the policy decision made by
     * inspection is INSPECTION; otherwise trajectory as before.
     */
    static EscalationSource escalationSource(DecisionType policyDecision, DecisionType inspectedDecision,
                                             DecisionType riskDecision, DecisionType finalDecision) {
        if (riskDecision != inspectedDecision) {
            return EscalationSource.RISK_ENGINE;
        }
        if (inspectedDecision != policyDecision) {
            return EscalationSource.INSPECTION;
        }
        return escalationSource(policyDecision, riskDecision, finalDecision);
    }

    /** Policy result for a secret found by content inspection: a final DENY, worded without the value. */
    static PolicyEvaluationResult inspectionDenial(InspectionResult inspection) {
        return PolicyEvaluationResult.builder()
                .decision(DecisionType.DENY)
                .reason(InspectionReasons.denial(inspection))
                .riskScore(INSPECTION_DENIAL_RISK_SCORE)
                .resourceSensitivity(ResourceSensitivity.CRITICAL)
                .build();
    }

    /** The policy result raised to REVIEW by inspection, with a note naming the finding (never the value). */
    private PolicyEvaluationResult withInspectionEscalation(PolicyEvaluationResult policyResult,
                                                            DecisionType inspectedDecision, InspectionResult inspection) {
        if (inspectedDecision == policyResult.getDecision()) {
            return policyResult;
        }
        return PolicyEvaluationResult.builder()
                .decision(inspectedDecision)
                .reason(policyResult.getReason() + InspectionReasons.reviewNote(inspection))
                .riskScore(policyResult.getRiskScore())
                .resourceSensitivity(policyResult.getResourceSensitivity())
                .build();
    }

    /** The resource to audit: unchanged, unless inspection found a secret in it, which is then redacted. */
    private String storedResource(EvaluationRequest request, InspectionResult inspection) {
        boolean secretInResource = inspection.findings().stream()
                .anyMatch(f -> f.category() == FindingCategory.SECRET && "resource".equals(f.location()));
        return secretInResource ? contentInspector.redactSecrets(request.getResource()) : request.getResource();
    }

    private static EvaluationResponse withInspection(EvaluationResponse response, InspectionResult inspection) {
        if (inspection.inspected()) {
            response.setInspectionVerdict(inspection.verdict());
            response.setInspectionFindings(inspection.findings());
        }
        return response;
    }

    /**
     * Records a trajectory escalation in the reason. The risk score is left unchanged, so the
     * policy and Risk Engine values in the response stay as they were.
     */
    private PolicyEvaluationResult withTrajectoryEscalation(PolicyEvaluationResult base, DecisionType finalDecision,
                                                             TrajectoryEvaluation trajectory) {
        if (trajectory == null || finalDecision == base.getDecision()) {
            return base;
        }
        String escalationNote = " Escalated to " + finalDecision + " by trajectory analysis (score "
                + trajectory.score() + ", " + trajectory.tier() + "): " + trajectory.reason();
        return PolicyEvaluationResult.builder()
                .decision(finalDecision)
                .reason(base.getReason() + escalationNote)
                .riskScore(base.getRiskScore())
                .resourceSensitivity(base.getResourceSensitivity())
                .build();
    }

    private PolicyEvaluationResult withEscalatedDecision(PolicyEvaluationResult policyResult,
                                                          DecisionType finalDecision,
                                                          RiskAssessment riskAssessment) {
        if (finalDecision == policyResult.getDecision()) {
            return policyResult;
        }
        String escalationNote = " Escalated to " + finalDecision + " by Risk Engine assessment ("
                + riskAssessment.riskTier()
                + (riskAssessment.engineAvailable() ? "" : ", " + riskAssessment.reason())
                + ").";
        return PolicyEvaluationResult.builder()
                .decision(finalDecision)
                .reason(policyResult.getReason() + escalationNote)
                .riskScore(policyResult.getRiskScore())
                .resourceSensitivity(policyResult.getResourceSensitivity())
                .build();
    }

    private EvaluationResponse buildResponse(UUID requestId, EvaluationRequest request, PolicyEvaluationResult result,
                                              AuthorizationDecision authorization, RiskTier riskTier,
                                              Boolean riskEngineAvailable, Integer riskEngineScore,
                                              Integer trajectoryScore, UUID reviewRequestId, Instant timestamp) {
        return EvaluationResponse.builder()
                .requestId(requestId)
                .agentId(request.getAgentId())
                .sessionId(request.getSessionId())
                .action(request.getAction())
                .resource(request.getResource())
                .decision(result.getDecision())
                .reason(result.getReason())
                .riskScore(result.getRiskScore())
                .authorizationResult(authorization.result())
                .riskTier(riskTier)
                .riskEngineAvailable(riskEngineAvailable)
                .riskEngineScore(riskEngineScore)
                .trajectoryScore(trajectoryScore)
                .reviewRequestId(reviewRequestId)
                .timestamp(timestamp)
                .build();
    }

    private PolicyEvaluationResult authorizationDenial(AuthorizationDecision authorization) {
        return PolicyEvaluationResult.builder()
                .decision(DecisionType.DENY)
                .reason("Authorization failed: " + authorization.reason())
                .riskScore(AUTHORIZATION_DENIAL_RISK_SCORE)
                .resourceSensitivity(ResourceSensitivity.CRITICAL)
                .build();
    }
}
