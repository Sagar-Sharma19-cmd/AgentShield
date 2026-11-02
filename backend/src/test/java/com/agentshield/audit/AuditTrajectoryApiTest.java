package com.agentshield.audit;

import com.agentshield.model.ActionOutcome;
import com.agentshield.model.ActionType;
import com.agentshield.model.DecisionType;
import com.agentshield.model.EscalationSource;
import com.agentshield.model.ResourceSensitivity;
import com.agentshield.model.RiskTier;
import com.agentshield.security.AdminApiKeyAuthenticationFilter;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import java.time.Instant;
import java.util.UUID;

import static org.hamcrest.Matchers.nullValue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Audit Read API exposure of the V9 trajectory fields. A trajectory-escalated row serializes its
 * trajectory values and escalated_by. A legacy row serializes every new field as null, which means
 * "not evaluated" (and, for escalated_by, "not recorded").
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class AuditTrajectoryApiTest {

    private static final String AGENT = "audit-traj-agent";

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private AuditRepository auditRepository;

    @Value("${agentshield.security.admin-api-key}")
    private String adminApiKey;

    @BeforeEach
    void setUp() {
        auditRepository.deleteAll();
    }

    @Test
    @DisplayName("Trajectory-escalated row: GET by requestId serializes score, tier, reason and escalated_by")
    void escalatedRowSerializesTrajectory() throws Exception {
        UUID requestId = save(row(UUID.randomUUID(), 60, RiskTier.HIGH, "DENIAL_DENSITY: 2 recent denials",
                EscalationSource.TRAJECTORY));

        mockMvc.perform(get("/api/v1/audit/{requestId}", requestId)
                        .header(AdminApiKeyAuthenticationFilter.HEADER, adminApiKey))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.decision").value("REVIEW"))
                .andExpect(jsonPath("$.riskScore").value(10))
                .andExpect(jsonPath("$.trajectoryScore").value(60))
                .andExpect(jsonPath("$.trajectoryTier").value("HIGH"))
                .andExpect(jsonPath("$.trajectoryReason").value("DENIAL_DENSITY: 2 recent denials"))
                .andExpect(jsonPath("$.escalatedBy").value("TRAJECTORY"));
    }

    @Test
    @DisplayName("Legacy row (no trajectory data): every new field serializes as null")
    void legacyRowSerializesNulls() throws Exception {
        AuditLog legacy = row(UUID.randomUUID(), null, null, null, null);
        UUID requestId = save(legacy);

        mockMvc.perform(get("/api/v1/audit/{requestId}", requestId)
                        .header(AdminApiKeyAuthenticationFilter.HEADER, adminApiKey))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.decision").value("ALLOW"))
                .andExpect(jsonPath("$.trajectoryScore").value(nullValue()))
                .andExpect(jsonPath("$.trajectoryTier").value(nullValue()))
                .andExpect(jsonPath("$.trajectoryReason").value(nullValue()))
                .andExpect(jsonPath("$.escalatedBy").value(nullValue()));
    }

    @Test
    @DisplayName("Evaluated with no signal: score 0 and tier LOW are serialized, not null")
    void evaluatedZeroIsNotNull() throws Exception {
        UUID requestId = save(row(UUID.randomUUID(), 0, RiskTier.LOW, "no trajectory signal", EscalationSource.NONE));

        mockMvc.perform(get("/api/v1/audit/{requestId}", requestId)
                        .header(AdminApiKeyAuthenticationFilter.HEADER, adminApiKey))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.trajectoryScore").value(0))
                .andExpect(jsonPath("$.trajectoryTier").value("LOW"))
                .andExpect(jsonPath("$.escalatedBy").value("NONE"));
    }

    @Test
    @DisplayName("List endpoint serializes trajectory fields for each row")
    void listSerializesTrajectory() throws Exception {
        save(row(UUID.randomUUID(), 60, RiskTier.HIGH, "TOOL_FAN_OUT: 4 distinct tools", EscalationSource.TRAJECTORY));

        mockMvc.perform(get("/api/v1/audit").param("agentId", AGENT)
                        .header(AdminApiKeyAuthenticationFilter.HEADER, adminApiKey))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content.length()").value(1))
                .andExpect(jsonPath("$.content[0].trajectoryScore").value(60))
                .andExpect(jsonPath("$.content[0].trajectoryTier").value("HIGH"))
                .andExpect(jsonPath("$.content[0].escalatedBy").value("TRAJECTORY"));
    }

    private AuditLog row(UUID requestId, Integer score, RiskTier tier, String reason, EscalationSource escalatedBy) {
        boolean escalated = escalatedBy == EscalationSource.TRAJECTORY;
        return AuditLog.builder()
                .requestId(requestId)
                .agentId(AGENT)
                .sessionId("audit-traj-session")
                .tool("filesystem")
                .action(ActionType.READ)
                .resource("src/Main.java")
                .resourceSensitivity(ResourceSensitivity.INTERNAL)
                .decision(escalated ? DecisionType.REVIEW : DecisionType.ALLOW)
                .riskScore(10)
                .reason("test")
                .actionOutcome(escalated ? ActionOutcome.REVIEW_REQUIRED : ActionOutcome.ALLOWED)
                .trajectoryScore(score)
                .trajectoryTier(tier)
                .trajectoryReason(reason)
                .escalatedBy(escalatedBy)
                .timestamp(Instant.now())
                .build();
    }

    private UUID save(AuditLog log) {
        if (log.getRequestId() == null) {
            throw new IllegalStateException("requestId required");
        }
        return auditRepository.save(log).getRequestId();
    }
}
