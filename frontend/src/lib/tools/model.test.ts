import { describe, expect, it } from "vitest";
import { TOOL_TYPE_LABELS, TOOL_TYPES, describeToolDisableEffect, validateToolRegistration } from "./model";

describe("validateToolRegistration", () => {
  it("builds a create request with the selected type", () => {
    expect(validateToolRegistration({ name: "github", description: "", toolType: "SOURCE_CONTROL" })).toEqual({
      value: { name: "github", toolType: "SOURCE_CONTROL" },
      errors: {},
    });
  });

  it("requires a tool type", () => {
    const result = validateToolRegistration({ name: "github", description: "", toolType: "" });
    expect(result.value).toBeNull();
    expect(result.errors.toolType).toBeDefined();
  });

  it("applies the same name rule as the backend", () => {
    expect(validateToolRegistration({ name: "Bad Name", description: "", toolType: "OTHER" }).errors.name).toBeDefined();
  });
});

describe("tool type catalogue", () => {
  it("has a label for every backend tool type", () => {
    expect(TOOL_TYPES.map((type) => TOOL_TYPE_LABELS[type])).toHaveLength(7);
    expect(new Set(TOOL_TYPES).size).toBe(7);
  });

  it("states the disable consequence without implying the tool is removed", () => {
    expect(describeToolDisableEffect("jenkins")).toMatch(/Existing grants are kept/);
  });
});

describe("describeToolDisableEffect", () => {
  it("says every agent using the tool is denied at the Permission gate", () => {
    expect(describeToolDisableEffect("jenkins")).toMatch(/Every agent that uses jenkins will be denied at the Permission gate/);
  });
});
