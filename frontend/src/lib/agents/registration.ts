import { ApiError } from "@/lib/api/client";
import type { AgentCreateRequest } from "@/types/api";

/** Same rule as AgentCreateRequest on the backend (name is 2–100 chars, lowercase, digits, . _ -). */
export const RESOURCE_NAME_PATTERN = /^[a-z0-9][a-z0-9._-]{1,99}$/;
export const RESOURCE_NAME_MESSAGE =
  "Use 2–100 characters: lowercase letters, digits, '.', '_' or '-', starting with a letter or digit.";
export const DESCRIPTION_MAX_LENGTH = 1000;

export type FieldErrors<Field extends string> = Partial<Record<Field, string>>;

export interface AgentRegistrationInput {
  name: string;
  description: string;
}

export interface ValidationResult<Value, Field extends string> {
  value: Value | null;
  errors: FieldErrors<Field>;
}

/**
 * Validates the registration form before any request is sent. The backend validates again and is the
 * authority; this only gives the operator an immediate, field-level message.
 */
export function validateAgentRegistration(
  input: AgentRegistrationInput,
): ValidationResult<AgentCreateRequest, "name" | "description"> {
  const name = input.name.trim();
  const description = input.description.trim();
  const errors: FieldErrors<"name" | "description"> = {};

  if (name.length === 0) {
    errors.name = "Enter a name for the agent.";
  } else if (!RESOURCE_NAME_PATTERN.test(name)) {
    errors.name = RESOURCE_NAME_MESSAGE;
  }

  if (description.length > DESCRIPTION_MAX_LENGTH) {
    errors.description = `Keep the description to ${DESCRIPTION_MAX_LENGTH} characters or fewer.`;
  }

  if (Object.keys(errors).length > 0) return { value: null, errors };
  return {
    value: description === "" ? { name } : { name, description },
    errors,
  };
}

/** Copy for a failed registration. Backend messages are not echoed; field errors are mapped separately. */
export function describeRegistrationError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 401 || error.status === 403) {
      return "AgentShield rejected the admin key. Lock the console and unlock it again.";
    }
    if (error.status === 400) return "AgentShield did not accept these details. Check the highlighted fields.";
    if (error.status === 409) return "An agent with this name may already exist. Choose a different name.";
    if (error.status >= 500) return "AgentShield could not register the agent. Try again in a moment.";
    return "The agent was not registered. Try again.";
  }
  if (error instanceof TypeError) return "AgentShield could not be reached. Check the connection and try again.";
  return "The agent could not be registered.";
}

/** Maps backend field errors (ErrorResponse.fieldErrors) onto the form's known fields only. */
export function mapServerFieldErrors<Field extends string>(
  error: unknown,
  fields: readonly Field[],
): FieldErrors<Field> {
  if (!(error instanceof ApiError) || !error.body?.fieldErrors) return {};
  const mapped: FieldErrors<Field> = {};
  for (const field of fields) {
    const message = error.body.fieldErrors[field];
    if (message) mapped[field] = message;
  }
  return mapped;
}
