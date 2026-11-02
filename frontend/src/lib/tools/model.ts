import { ApiError } from "@/lib/api/client";
import {
  DESCRIPTION_MAX_LENGTH,
  RESOURCE_NAME_MESSAGE,
  RESOURCE_NAME_PATTERN,
  type FieldErrors,
} from "@/lib/agents/registration";
import type { ToolCreateRequest, ToolStatus, ToolType } from "@/types/api";

/** Order matches the backend enum (com.agentshield.model.ToolType). */
export const TOOL_TYPES = [
  "FILESYSTEM",
  "DATABASE",
  "SOURCE_CONTROL",
  "HTTP",
  "CLOUD_STORAGE",
  "SHELL",
  "OTHER",
] as const satisfies readonly ToolType[];

export const TOOL_TYPE_LABELS: Record<ToolType, string> = {
  FILESYSTEM: "Filesystem",
  DATABASE: "Database",
  SOURCE_CONTROL: "Source control",
  HTTP: "HTTP / outbound",
  CLOUD_STORAGE: "Cloud storage",
  SHELL: "Shell",
  OTHER: "Other",
};

export const TOOL_STATUS_LABELS: Record<ToolStatus, string> = {
  ACTIVE: "Active",
  DISABLED: "Disabled",
};

export interface ToolRegistrationInput {
  name: string;
  description: string;
  toolType: ToolType | "";
}

export type ToolRegistrationErrors = FieldErrors<"name" | "description" | "toolType">;

/** Same rules as ToolCreateRequest on the backend. The backend remains the authority. */
export function validateToolRegistration(
  input: ToolRegistrationInput,
): { value: ToolCreateRequest | null; errors: ToolRegistrationErrors } {
  const name = input.name.trim();
  const description = input.description.trim();
  const errors: ToolRegistrationErrors = {};

  if (name.length === 0) errors.name = "Enter a name for the tool.";
  else if (!RESOURCE_NAME_PATTERN.test(name)) errors.name = RESOURCE_NAME_MESSAGE;

  if (description.length > DESCRIPTION_MAX_LENGTH) {
    errors.description = `Keep the description to ${DESCRIPTION_MAX_LENGTH} characters or fewer.`;
  }
  if (input.toolType === "") errors.toolType = "Choose a tool type.";

  if (Object.keys(errors).length > 0 || input.toolType === "") return { value: null, errors };
  return {
    value: description === "" ? { name, toolType: input.toolType } : { name, description, toolType: input.toolType },
    errors,
  };
}

/** Copy for a failed tool change. Backend messages are not echoed. */
export function describeToolError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 401 || error.status === 403) {
      return "AgentShield rejected the admin key. Lock the console and unlock it again.";
    }
    if (error.status === 400) return "AgentShield did not accept these details. Check the highlighted fields.";
    if (error.status === 404) return "This tool could not be found. Refresh the list and try again.";
    if (error.status === 409) return "A tool with this name may already exist. Choose a different name.";
    if (error.status >= 500) return "AgentShield could not complete the change. Try again in a moment.";
    return "The change was not made. Refresh and try again.";
  }
  if (error instanceof TypeError) return "AgentShield could not be reached. Check the connection and try again.";
  return "The change could not be completed.";
}

/** Consequence text for disabling a tool, shown before the operator confirms. */
export function describeToolDisableEffect(toolName: string): string {
  return `Gateway requests to ${toolName} will be denied for every agent (TOOL_DISABLED) until it is enabled again. Existing grants are kept and become effective again when the tool is enabled.`;
}
