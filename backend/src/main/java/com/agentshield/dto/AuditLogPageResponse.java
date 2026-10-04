package com.agentshield.dto;

import com.agentshield.audit.AuditLog;
import org.springframework.data.domain.Page;

import java.util.List;

/**
 * Pagination envelope for the Audit Read API's list endpoint (GET /api/v1/audit).
 * A dedicated DTO is used instead of returning Spring Data's {@code Page} directly so the
 * wire format is a predictable, stable shape independent of {@code PageImpl}'s own
 * serialization.
 */
public record AuditLogPageResponse(
        List<AuditLogResponse> content,
        int page,
        int size,
        long totalElements,
        int totalPages
) {
    public static AuditLogPageResponse from(Page<AuditLog> page) {
        return new AuditLogPageResponse(
                page.getContent().stream().map(AuditLogResponse::from).toList(),
                page.getNumber(),
                page.getSize(),
                page.getTotalElements(),
                page.getTotalPages());
    }
}
