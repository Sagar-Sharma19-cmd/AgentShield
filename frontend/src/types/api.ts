/**
 * TypeScript mirrors of the actual Spring Boot DTOs and enums in
 * backend/src/main/java/com/agentshield/{dto,model}. Field names and enum values are
 * copied verbatim from the Java source — do not add fields that don't exist server-side.
 */

export type ActionType = "READ" | "WRITE" | "DELETE" | "EXECUTE" | "EXTERNAL_REQUEST";

export type ToolType =
  | "FILESYSTEM"
  | "DATABASE"
  | "SOURCE_CONTROL"
  | "HTTP"
  | "CLOUD_STORAGE"
  | "SHELL"
  | "OTHER";

export type ToolStatus = "ACTIVE" | "DISABLED";

export type AgentStatus = "ACTIVE" | "SUSPENDED" | "REVOKED";

export type ReviewStatus = "PENDING" | "IN_REVIEW" | "APPROVED" | "REJECTED";

export type DecisionType = "ALLOW" | "REVIEW" | "DENY";

export type RiskTier = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export type AuthorizationResult =
  | "AUTHORIZED"
  | "UNAUTHORIZED"
  | "AGENT_NOT_FOUND"
  | "AGENT_SUSPENDED"
  | "AGENT_REVOKED"
  | "AGENT_IDENTITY_MISMATCH"
  | "TOOL_NOT_FOUND"
  | "TOOL_DISABLED"
  | "PERMISSION_DISABLED";

export type ActionOutcome = "ALLOWED" | "BLOCKED" | "REVIEW_REQUIRED";

export type ResourceSensitivity = "PUBLIC" | "INTERNAL" | "SENSITIVE" | "CRITICAL";

// ---------------------------------------------------------------------------
// Agents
// ---------------------------------------------------------------------------

export interface AgentCreateRequest {
  name: string;
  description?: string;
}

export interface AgentResponse {
  id: string;
  name: string;
  description: string | null;
  status: AgentStatus;
  apiKeyPrefix: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Only ever present in the two responses that mint a fresh key (register / rotate). */
export interface AgentCreateResponse extends AgentResponse {
  apiKey: string;
}

export interface AgentStatusUpdateRequest {
  status: AgentStatus;
}

// ---------------------------------------------------------------------------
// Tools
// ---------------------------------------------------------------------------

export interface ToolCreateRequest {
  name: string;
  description?: string;
  toolType: ToolType;
}

export interface ToolResponse {
  id: string;
  name: string;
  description: string | null;
  toolType: ToolType;
  status: ToolStatus;
  createdAt: string;
  updatedAt: string;
}

export interface ToolStatusUpdateRequest {
  status: ToolStatus;
}

// ---------------------------------------------------------------------------
// Permissions
// ---------------------------------------------------------------------------

export interface PermissionCreateRequest {
  agentId: string;
  toolId: string;
  allowedActions: ActionType[];
  enabled?: boolean;
}

export interface PermissionResponse {
  id: string;
  agentId: string;
  agentName: string;
  toolId: string;
  toolName: string;
  allowedActions: ActionType[];
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Gateway
// ---------------------------------------------------------------------------

export interface EvaluationRequest {
  agentId: string;
  sessionId: string;
  action: ActionType;
  resource: string;
  tool: string;
  metadata?: Record<string, unknown>;
}

export interface EvaluationResponse {
  requestId: string;
  agentId: string;
  sessionId: string;
  action: ActionType;
  resource: string;
  decision: DecisionType;
  reason: string;
  riskScore: number;
  authorizationResult: AuthorizationResult;
  riskTier: RiskTier | null;
  riskEngineAvailable: boolean | null;
  reviewRequestId: string | null;
  timestamp: string;
}

// ---------------------------------------------------------------------------
// Reviews
// ---------------------------------------------------------------------------

export interface ReviewRequestResponse {
  id: string;
  requestId: string;
  agentId: string;
  sessionId: string;
  tool: string;
  action: ActionType;
  resource: string;
  resourceSensitivity: ResourceSensitivity;
  riskScore: number;
  riskTier: RiskTier;
  originalDecision: DecisionType;
  status: ReviewStatus;
  reason: string;
  createdAt: string;
  updatedAt: string;
  reviewedAt: string | null;
}

// ---------------------------------------------------------------------------
// Audit
// ---------------------------------------------------------------------------

export interface AuditLogResponse {
  id: string;
  requestId: string;
  agentId: string;
  sessionId: string;
  tool: string;
  action: ActionType;
  resource: string;
  resourceSensitivity: ResourceSensitivity;
  decision: DecisionType;
  riskScore: number;
  reason: string;
  actionOutcome: ActionOutcome;
  registeredAgentId: string | null;
  registeredToolId: string | null;
  authorizationResult: AuthorizationResult;
  authorizationReason: string;
  timestamp: string;
}

export interface AuditLogPageResponse {
  content: AuditLogResponse[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
}

export interface AuditSearchParams {
  agentId?: string;
  decision?: DecisionType;
  authorizationResult?: AuthorizationResult;
  from?: string;
  to?: string;
  page?: number;
  size?: number;
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export interface ErrorResponse {
  timestamp: string;
  status: number;
  error: string;
  message: string;
  fieldErrors: Record<string, string>;
}
