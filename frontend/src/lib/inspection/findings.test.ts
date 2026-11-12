import { describe, expect, it } from "vitest";
import type { ContentFinding, FindingCategory } from "@/types/api";
import {
  FINDING_CATEGORY_DECISION,
  FINDING_CATEGORY_LABELS,
  FINDINGS_EMPTY_COPY,
  FINDINGS_NOT_RECORDED_COPY,
  findingsState,
  findingTypeLabel,
  inspectedSubject,
  sortFindings,
} from "./findings";

const finding = (category: FindingCategory, type: string, location: string): ContentFinding => ({
  category,
  type,
  location,
  preview: category === "SECRET" ? "AKIA… (20 chars)" : `[${type}] (17 chars)`,
});

describe("findingsState", () => {
  it("null or missing findings mean inspection did not run: not recorded, never clean", () => {
    expect(findingsState(null)).toEqual({ kind: "not-recorded" });
    expect(findingsState(undefined)).toEqual({ kind: "not-recorded" });
  });

  it("an empty list means inspected and clean", () => {
    expect(findingsState([])).toEqual({ kind: "clean" });
  });

  it("found findings are sorted secrets first, keeping recorded order within a category", () => {
    const email = finding("PII", "EMAIL", "arguments.to");
    const injection = finding("PROMPT_INJECTION", "INSTRUCTION_OVERRIDE", "arguments.body");
    const aws = finding("SECRET", "AWS_ACCESS_KEY", "arguments[3]");
    const card = finding("PII", "CREDIT_CARD", "arguments.card");
    const state = findingsState([email, injection, aws, card]);
    expect(state.kind).toBe("found");
    if (state.kind === "found") expect(state.findings).toEqual([aws, email, card, injection]);
  });

  it("sorting does not mutate the recorded list", () => {
    const recorded = [finding("PII", "EMAIL", "a"), finding("SECRET", "JWT", "b")];
    sortFindings(recorded);
    expect(recorded[0].type).toBe("EMAIL");
  });
});

describe("labels", () => {
  it("every category has a label and a decision; only secrets deny", () => {
    for (const category of ["SECRET", "PII", "PROMPT_INJECTION"] as const) {
      expect(FINDING_CATEGORY_LABELS[category].length).toBeGreaterThan(0);
    }
    expect(FINDING_CATEGORY_DECISION).toEqual({ SECRET: "DENY", PII: "REVIEW", PROMPT_INJECTION: "REVIEW" });
  });

  it("known types get words; unknown types fall back to the recorded code", () => {
    expect(findingTypeLabel("AWS_ACCESS_KEY")).toBe("AWS access key");
    expect(findingTypeLabel("EMAIL")).toBe("Email address");
    expect(findingTypeLabel("SOMETHING_NEW")).toBe("SOMETHING_NEW");
  });
});

describe("empty-state copy", () => {
  it("uses the arguments wording for requests and the output wording for output inspection rows", () => {
    expect(inspectedSubject("s3://bucket/file")).toBe("arguments");
    expect(inspectedSubject("output:curl")).toBe("output");
    expect(FINDINGS_EMPTY_COPY.arguments).toBe("No sensitive content found in the resource or arguments.");
    expect(FINDINGS_EMPTY_COPY.output).toBe("No sensitive content found in the output.");
    expect(FINDINGS_NOT_RECORDED_COPY).toMatch(/^Not recorded/);
  });
});
