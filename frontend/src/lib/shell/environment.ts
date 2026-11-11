/**
 * The environment label in the sidebar footer. Read from NEXT_PUBLIC_AGENTSHIELD_ENV, which Next.js inlines at
 * build time (see frontend/.env.example). Defaults to "Local", so a screenshot never implies a hosted deployment.
 * Pure; tested in environment.test.ts.
 */
export const DEFAULT_ENVIRONMENT_LABEL = "Local";
const MAX_LENGTH = 24;

export function environmentLabel(raw: string | undefined): string {
  const value = raw?.trim().replace(/\s+/g, " ") ?? "";
  if (value === "") return DEFAULT_ENVIRONMENT_LABEL;
  return value.length > MAX_LENGTH ? value.slice(0, MAX_LENGTH) : value;
}
