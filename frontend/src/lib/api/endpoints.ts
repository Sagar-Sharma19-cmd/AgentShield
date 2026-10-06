import { apiRequest } from "./client";
import type {
  AgentCreateRequest,
  AgentCreateResponse,
  AgentResponse,
  AgentStatus,
  AuditLogPageResponse,
  AuditLogResponse,
  AuditSearchParams,
  EvaluationRequest,
  EvaluationResponse,
  PermissionCreateRequest,
  PermissionResponse,
  ReviewRequestResponse,
  ReviewStatus,
  ToolCreateRequest,
  ToolResponse,
  ToolStatus,
} from "@/types/api";

/** Every admin-protected call needs the admin key explicitly — no hidden global state. */
type AdminAuth = { adminKey: string };

export const agentsApi = {
  list: ({ adminKey }: AdminAuth) =>
    apiRequest<AgentResponse[]>("/agents", { auth: { kind: "admin", key: adminKey } }),

  get: (id: string, { adminKey }: AdminAuth) =>
    apiRequest<AgentResponse>(`/agents/${id}`, { auth: { kind: "admin", key: adminKey } }),

  register: (body: AgentCreateRequest, { adminKey }: AdminAuth) =>
    apiRequest<AgentCreateResponse>("/agents", {
      method: "POST",
      body,
      auth: { kind: "admin", key: adminKey },
    }),

  updateStatus: (id: string, status: AgentStatus, { adminKey }: AdminAuth) =>
    apiRequest<AgentResponse>(`/agents/${id}/status`, {
      method: "PATCH",
      body: { status },
      auth: { kind: "admin", key: adminKey },
    }),

  rotateKey: (id: string, { adminKey }: AdminAuth) =>
    apiRequest<AgentCreateResponse>(`/agents/${id}/rotate-key`, {
      method: "POST",
      auth: { kind: "admin", key: adminKey },
    }),
};

export const toolsApi = {
  list: ({ adminKey }: AdminAuth) =>
    apiRequest<ToolResponse[]>("/tools", { auth: { kind: "admin", key: adminKey } }),

  get: (id: string, { adminKey }: AdminAuth) =>
    apiRequest<ToolResponse>(`/tools/${id}`, { auth: { kind: "admin", key: adminKey } }),

  register: (body: ToolCreateRequest, { adminKey }: AdminAuth) =>
    apiRequest<ToolResponse>("/tools", {
      method: "POST",
      body,
      auth: { kind: "admin", key: adminKey },
    }),

  updateStatus: (id: string, status: ToolStatus, { adminKey }: AdminAuth) =>
    apiRequest<ToolResponse>(`/tools/${id}/status`, {
      method: "PATCH",
      body: { status },
      auth: { kind: "admin", key: adminKey },
    }),
};

export const permissionsApi = {
  listForAgent: (agentId: string, { adminKey }: AdminAuth) =>
    apiRequest<PermissionResponse[]>(`/permissions/agent/${agentId}`, {
      auth: { kind: "admin", key: adminKey },
    }),

  grant: (body: PermissionCreateRequest, { adminKey }: AdminAuth) =>
    apiRequest<PermissionResponse>("/permissions", {
      method: "POST",
      body,
      auth: { kind: "admin", key: adminKey },
    }),

  revoke: (id: string, { adminKey }: AdminAuth) =>
    apiRequest<void>(`/permissions/${id}`, {
      method: "DELETE",
      auth: { kind: "admin", key: adminKey },
    }),
};

export const reviewsApi = {
  listByStatus: (status: ReviewStatus, { adminKey }: AdminAuth) =>
    apiRequest<ReviewRequestResponse[]>("/reviews", {
      auth: { kind: "admin", key: adminKey },
      searchParams: { status },
    }),

  get: (id: string, { adminKey }: AdminAuth) =>
    apiRequest<ReviewRequestResponse>(`/reviews/${id}`, {
      auth: { kind: "admin", key: adminKey },
    }),

  start: (id: string, { adminKey }: AdminAuth) =>
    apiRequest<ReviewRequestResponse>(`/reviews/${id}/start`, {
      method: "POST",
      auth: { kind: "admin", key: adminKey },
    }),

  approve: (id: string, { adminKey }: AdminAuth) =>
    apiRequest<ReviewRequestResponse>(`/reviews/${id}/approve`, {
      method: "POST",
      auth: { kind: "admin", key: adminKey },
    }),

  reject: (id: string, { adminKey }: AdminAuth) =>
    apiRequest<ReviewRequestResponse>(`/reviews/${id}/reject`, {
      method: "POST",
      auth: { kind: "admin", key: adminKey },
    }),
};

export const auditApi = {
  search: (params: AuditSearchParams, { adminKey }: AdminAuth) =>
    apiRequest<AuditLogPageResponse>("/audit", {
      auth: { kind: "admin", key: adminKey },
      searchParams: { ...params },
    }),

  getByRequestId: (requestId: string, { adminKey }: AdminAuth) =>
    apiRequest<AuditLogResponse>(`/audit/${requestId}`, {
      auth: { kind: "admin", key: adminKey },
    }),
};

export const gatewayApi = {
  evaluate: (body: EvaluationRequest, agentKey: string) =>
    apiRequest<EvaluationResponse>("/gateway/evaluate", {
      method: "POST",
      body,
      auth: { kind: "agent", key: agentKey },
    }),
};
