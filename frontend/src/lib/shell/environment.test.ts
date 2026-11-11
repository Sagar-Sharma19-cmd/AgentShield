import { describe, expect, it } from "vitest";
import { DEFAULT_ENVIRONMENT_LABEL, environmentLabel } from "./environment";

describe("environmentLabel", () => {
  it("defaults to Local when unset or blank", () => {
    expect(DEFAULT_ENVIRONMENT_LABEL).toBe("Local");
    expect(environmentLabel(undefined)).toBe("Local");
    expect(environmentLabel("")).toBe("Local");
    expect(environmentLabel("   ")).toBe("Local");
  });

  it("uses the configured value, trimmed and on one line", () => {
    expect(environmentLabel("Staging")).toBe("Staging");
    expect(environmentLabel("  Demo \n laptop ")).toBe("Demo laptop");
  });

  it("caps a long value so the sidebar badge stays small", () => {
    expect(environmentLabel("x".repeat(40))).toHaveLength(24);
  });
});
