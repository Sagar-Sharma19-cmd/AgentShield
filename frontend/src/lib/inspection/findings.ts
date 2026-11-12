/**
 * Content inspection findings (V13), as recorded by the gateway: redacted (type, location and a preview such as
 * "AKIA… (20 chars)"), never the raw value. Pure; tested in findings.test.ts.
 */
import type { ContentFinding, DecisionType, FindingCategory } from "@/types/api";

export const FINDING_CATEGORY_LABELS: Record<FindingCategory, string> = {
  SECRET: "Secret",
  PII: "Personal data",
  PROMPT_INJECTION: "Prompt injection",
};

/** The decision each category produces on its own: a secret is denied, the others go to review. */
export const FINDING_CATEGORY_DECISION: Record<FindingCategory, Exclude<DecisionType, "ALLOW">> = {
  SECRET: "DENY",
  PII: "REVIEW",
  PROMPT_INJECTION: "REVIEW",
};

const TYPE_LABELS: Record<string, string> = {
  AWS_ACCESS_KEY: "AWS access key",
  AWS_SECRET_KEY: "AWS secret key",
  PRIVATE_KEY: "Private key",
  GITHUB_TOKEN: "GitHub token",
  SLACK_TOKEN: "Slack token",
  STRIPE_LIVE_KEY: "Stripe live key",
  GOOGLE_API_KEY: "Google API key",
  JWT: "JSON Web Token",
  GENERIC_SECRET: "Password or secret",
  EMAIL: "Email address",
  CREDIT_CARD: "Payment card number",
  PAN: "PAN (India)",
  AADHAAR: "Aadhaar number",
  PHONE_NUMBER: "Phone number",
  INSTRUCTION_OVERRIDE: "Instruction-override phrase",
  UNICODE_TAG_CHARACTERS: "Hidden Unicode tag characters",
  BIDI_CONTROL: "Bidirectional text controls",
};

/** Human label for a finding type; unknown types fall back to the recorded code. */
export function findingTypeLabel(type: string): string {
  return TYPE_LABELS[type] ?? type;
}

const CATEGORY_RANK: Record<FindingCategory, number> = { SECRET: 0, PII: 1, PROMPT_INJECTION: 2 };

/** Secrets first, then personal data, then prompt injection; recorded order within a category. */
export function sortFindings(findings: readonly ContentFinding[]): ContentFinding[] {
  return findings
    .map((finding, index) => ({ finding, index }))
    .sort((a, b) => CATEGORY_RANK[a.finding.category] - CATEGORY_RANK[b.finding.category] || a.index - b.index)
    .map(({ finding }) => finding);
}

export type FindingsState =
  /** Inspection did not run (the record predates content inspection, or inspection was disabled). */
  | { kind: "not-recorded" }
  /** Inspection ran and found nothing. */
  | { kind: "clean" }
  | { kind: "found"; findings: ContentFinding[] };

export function findingsState(findings: readonly ContentFinding[] | null | undefined): FindingsState {
  if (findings === null || findings === undefined) return { kind: "not-recorded" };
  if (findings.length === 0) return { kind: "clean" };
  return { kind: "found", findings: sortFindings(findings) };
}

/** What was inspected, for the empty-state wording: request arguments, or tool output (/gateway/inspect rows). */
export type InspectedSubject = "arguments" | "output";

/** Output-inspection audit rows use the resource "output:<tool>" (backend OutputInspectionService). */
export function inspectedSubject(resource: string): InspectedSubject {
  return resource.startsWith("output:") ? "output" : "arguments";
}

export const FINDINGS_EMPTY_COPY: Record<InspectedSubject, string> = {
  arguments: "No sensitive content found in the resource or arguments.",
  output: "No sensitive content found in the output.",
};

export const FINDINGS_NOT_RECORDED_COPY =
  "Not recorded: this was logged before content inspection, or inspection did not run.";
