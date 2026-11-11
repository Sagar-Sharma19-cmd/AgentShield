import { describe, expect, it } from "vitest";
import { breakableParts } from "./text";

describe("breakableParts", () => {
  it("splits after each slash, hyphen and inner dot, keeping the separator on the left part", () => {
    expect(breakableParts("agentshield/repo/build-info")).toEqual(["agentshield/", "repo/", "build-", "info"]);
    expect(breakableParts("registry.staging.example.test/agentshield-api")).toEqual([
      "registry.",
      "staging.",
      "example.",
      "test/",
      "agentshield-",
      "api",
    ]);
  });

  it("keeps a leading dot with its name", () => {
    expect(breakableParts(".env")).toEqual([".env"]);
    expect(breakableParts("/app/.env")).toEqual(["/", "app/", ".env"]);
  });

  it("does not split inside a name (only at the separators)", () => {
    expect(breakableParts("docker/agentshield-api:staging-1")).toEqual(["docker/", "agentshield-", "api:staging-", "1"]);
    expect(breakableParts("EXTERNAL_REQUEST")).toEqual(["EXTERNAL_REQUEST"]);
  });

  it("round-trips every resource exactly", () => {
    for (const resource of ["/app/.env", "docker/agentshield-api:staging-1", ".env", "a//b--c/", "a..b", "x.", ""]) {
      expect(breakableParts(resource).join("")).toBe(resource);
    }
  });

  it("returns nothing for an empty string", () => {
    expect(breakableParts("")).toEqual([]);
  });
});
