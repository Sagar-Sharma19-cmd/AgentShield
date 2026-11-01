import type {
  ActionOutcome,
  ActionType,
  AuthorizationResult,
  DecisionType,
  ResourceSensitivity,
} from "@/types/api";

/**
 * Human-readable labels for backend enums. Each map is a Record over the full union, so adding
 * a value to types/api.ts without a label here is a compile error.
 */

export const DECISION_TYPES = ["ALLOW", "REVIEW", "DENY"] as const satisfies readonly DecisionType[];

export const DECISION_LABELS: Record<DecisionType, string> = {
  ALLOW: "Allowed",
  REVIEW: "Review required",
  DENY: "Denied",
};

export const AUTHORIZATION_RESULTS = [
  "AUTHORIZED",
  "UNAUTHORIZED",
  "AGENT_NOT_FOUND",
  "AGENT_SUSPENDED",
  "AGENT_REVOKED",
  "AGENT_IDENTITY_MISMATCH",
  "TOOL_NOT_FOUND",
  "TOOL_DISABLED",
  "PERMISSION_DISABLED",
] as const satisfies readonly AuthorizationResult[];

export const AUTHORIZATION_LABELS: Record<AuthorizationResult, string> = {
  AUTHORIZED: "Authorized",
  UNAUTHORIZED: "No permission grant",
  AGENT_NOT_FOUND: "Agent not registered",
  AGENT_SUSPENDED: "Agent suspended",
  AGENT_REVOKED: "Agent revoked",
  AGENT_IDENTITY_MISMATCH: "Agent identity mismatch",
  TOOL_NOT_FOUND: "Tool not registered",
  TOOL_DISABLED: "Tool disabled",
  PERMISSION_DISABLED: "Permission disabled",
};

export const ACTION_LABELS: Record<ActionType, string> = {
  READ: "Read",
  WRITE: "Write",
  DELETE: "Delete",
  EXECUTE: "Execute",
  EXTERNAL_REQUEST: "External request",
};

export const OUTCOME_LABELS: Record<ActionOutcome, string> = {
  ALLOWED: "Allowed",
  BLOCKED: "Blocked",
  REVIEW_REQUIRED: "Held for review",
};

export const SENSITIVITY_LABELS: Record<ResourceSensitivity, string> = {
  PUBLIC: "Public",
  INTERNAL: "Internal",
  SENSITIVE: "Sensitive",
  CRITICAL: "Critical",
};
