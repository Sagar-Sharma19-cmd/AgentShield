package com.agentshield.riskengine;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.UUID;

/**
 * Spring Data JPA repository for RiskAssessmentRecord persistence.
 */
@Repository
public interface RiskAssessmentRepository extends JpaRepository<RiskAssessmentRecord, UUID> {

    List<RiskAssessmentRecord> findByRequestId(UUID requestId);
}
