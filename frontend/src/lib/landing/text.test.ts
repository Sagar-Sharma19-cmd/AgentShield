import { describe, expect, it } from "vitest";
import { breakableParts } from "./text";

describe("breakableParts", () => {
  it("splits after each slash and hyphen, keeping the separator on the left part", () => {
    expect(breakableParts("agentshield/repo/build-info")).toEqual(["agentshield/", "repo/", "build-", "info"]);
    expect(breakableParts("registry.staging.example.test/agentshield-api")).toEqual([
      "registry.staging.example.test/",
      "agentshield-",
      "api",
    ]);
  });

  it("round-trips every resource exactly", () => {
    for (const resource of ["/app/.env", "docker/agentshield-api:staging-1", ".env", "a//b--c/", ""]) {
      expect(breakableParts(resource).join("")).toBe(resource);
    }
  });

  it("leaves a resource without separators whole", () => {
    expect(breakableParts(".env")).toEqual([".env"]);
    expect(breakableParts("")).toEqual([]);
  });
});
