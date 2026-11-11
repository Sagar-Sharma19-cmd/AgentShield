import { describe, expect, it } from "vitest";
import {
  LANDING_SCENARIOS,
  PIPELINE_STAGES,
  PROMPT_EXAMPLES,
  faceModeFor,
  faceModeForSection,
} from "./content";

describe("faceModeFor", () => {
  it("maps each decision to its face symbol, and nothing to idle", () => {
    expect(faceModeFor("ALLOW")).toBe("check");
    expect(faceModeFor("REVIEW")).toBe("eye");
    expect(faceModeFor("DENY")).toBe("barred");
    expect(faceModeFor(null)).toBe("idle");
    expect(faceModeFor(undefined)).toBe("idle");
  });

  it("follows the scenario only in the scenarios section", () => {
    expect(faceModeForSection("intro", "DENY")).toBe("idle");
    expect(faceModeForSection("product", "ALLOW")).toBe("idle");
    expect(faceModeForSection("scenarios", "DENY")).toBe("barred");
    expect(faceModeForSection("scenarios", null)).toBe("idle");
  });
});

describe("landing scenarios", () => {
  it("lists the five simulator scenarios and the trajectory demo with their documented outcomes", () => {
    expect(Object.fromEntries(LANDING_SCENARIOS.map((scenario) => [scenario.id, scenario.decision]))).toEqual({
      basic_read_write: "ALLOW",
      credential_access: "DENY",
      review_required: "REVIEW",
      deployment_pipeline: "REVIEW",
      scope_escalation: "REVIEW",
      trajectory: "REVIEW",
    });
  });

  it("points the decisive step at the step the docs name", () => {
    const byId = Object.fromEntries(LANDING_SCENARIOS.map((scenario) => [scenario.id, scenario]));
    const decisive = (id: string) => byId[id].steps[byId[id].decisiveStep];
    expect(decisive("deployment_pipeline").action).toBe("EXTERNAL_REQUEST");
    expect(decisive("scope_escalation").action).toBe("DELETE");
    expect(decisive("trajectory")).toMatchObject({ action: "WRITE", tool: "kubernetes" });
    expect(byId.trajectory.stage).toBe("Trajectory");
  });
});

describe("prompt examples and pipeline", () => {
  it("each verdict line starts with its decision", () => {
    for (const example of PROMPT_EXAMPLES) expect(example.verdict.startsWith(`${example.decision} ·`)).toBe(true);
  });

  it("lists the seven stages in gateway order", () => {
    expect(PIPELINE_STAGES.map((stage) => stage.label)).toEqual([
      "Identity",
      "Permission",
      "Policy",
      "Risk engine",
      "Trajectory",
      "Human review",
      "Audit",
    ]);
  });
});
