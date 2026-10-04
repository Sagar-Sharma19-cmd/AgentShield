package com.agentshield.audit;

import com.agentshield.model.AuthorizationResult;
import com.agentshield.model.DecisionType;
import org.springframework.data.jpa.domain.Specification;

import java.time.Instant;

/**
 * Optional-filter building blocks for the Audit Read API's list query (AuditService#search).
 * Each method returns null (no predicate) when its filter value is absent, so callers compose
 * them with {@code Specification.where(...).and(...)} without branching on nullability themselves.
 */
final class AuditLogSpecifications {

    private AuditLogSpecifications() {
    }

    static Specification<AuditLog> agentIdEquals(String agentId) {
        return (root, query, cb) -> agentId == null ? null : cb.equal(root.get("agentId"), agentId);
    }

    static Specification<AuditLog> decisionEquals(DecisionType decision) {
        return (root, query, cb) -> decision == null ? null : cb.equal(root.get("decision"), decision);
    }

    static Specification<AuditLog> authorizationResultEquals(AuthorizationResult authorizationResult) {
        return (root, query, cb) ->
                authorizationResult == null ? null : cb.equal(root.get("authorizationResult"), authorizationResult);
    }

    static Specification<AuditLog> timestampFrom(Instant from) {
        return (root, query, cb) -> from == null ? null : cb.greaterThanOrEqualTo(root.get("timestamp"), from);
    }

    static Specification<AuditLog> timestampTo(Instant to) {
        return (root, query, cb) -> to == null ? null : cb.lessThanOrEqualTo(root.get("timestamp"), to);
    }
}
