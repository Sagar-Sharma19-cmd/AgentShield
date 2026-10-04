package com.agentshield.riskengine;

import com.agentshield.model.RiskTier;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Primary;
import org.springframework.context.annotation.Profile;

import java.util.List;

/**
 * Default RiskEngineClient for the "test" Spring profile: always returns a deterministic
 * LOW-risk, available assessment, so tests written before Risk Engine integration existed
 * (asserting plain ALLOW/REVIEW/DENY decisions and exact PolicyEngine risk scores) continue
 * to pass unchanged — LOW/MEDIUM never escalates a decision (see DecisionEscalator).
 *
 * Tests that need to exercise escalation, fallback, or failure behavior override this bean
 * with {@code @MockBean RiskEngineClient} and stub it per scenario.
 *
 * Deliberately a plain {@code @Configuration} (not {@code @TestConfiguration}): Spring Boot
 * excludes {@code @TestConfiguration} classes from automatic component scanning (they must be
 * imported explicitly), whereas this needs to be picked up automatically by every
 * {@code @SpringBootTest} that activates the "test" profile without each one importing it.
 */
@Configuration
@Profile("test")
public class TestRiskEngineClientConfig {

    @Bean
    @Primary
    public RiskEngineClient riskEngineClient() {
        return (action, resource, resourceSensitivity) ->
                new RiskAssessment(5, RiskTier.LOW, List.of(), "test-default-low-risk", true);
    }
}
