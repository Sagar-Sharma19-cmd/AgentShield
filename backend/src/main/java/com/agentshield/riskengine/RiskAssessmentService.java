package com.agentshield.riskengine;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.UUID;

/**
 * Persists the detailed Risk Engine assessment for a gateway request, correlated by
 * requestId with the corresponding audit_logs row. This is the detailed risk assessment
 * record; audit_logs intentionally does not duplicate the factor breakdown.
 */
@Service
public class RiskAssessmentService {

    private static final Logger log = LoggerFactory.getLogger(RiskAssessmentService.class);

    private final RiskAssessmentRepository riskAssessmentRepository;
    private final ObjectMapper objectMapper;

    @Autowired
    public RiskAssessmentService(RiskAssessmentRepository riskAssessmentRepository, ObjectMapper objectMapper) {
        this.riskAssessmentRepository = riskAssessmentRepository;
        this.objectMapper = objectMapper;
    }

    @Transactional
    public RiskAssessmentRecord persist(UUID requestId, RiskAssessment assessment, Instant timestamp) {
        RiskAssessmentRecord record = RiskAssessmentRecord.builder()
                .requestId(requestId)
                .riskScore(assessment.riskScore())
                .riskTier(assessment.riskTier())
                .factors(writeFactorsAsJson(assessment))
                .reason(assessment.reason())
                .engineAvailable(assessment.engineAvailable())
                .createdAt(timestamp)
                .build();

        return riskAssessmentRepository.save(record);
    }

    private String writeFactorsAsJson(RiskAssessment assessment) {
        try {
            return objectMapper.writeValueAsString(assessment.factors());
        } catch (JsonProcessingException e) {
            // Never block persistence of the score/tier/reason over a serialization issue.
            log.warn("Failed to serialize Risk Engine factors to JSON: {}", e.getMessage());
            return null;
        }
    }
}
