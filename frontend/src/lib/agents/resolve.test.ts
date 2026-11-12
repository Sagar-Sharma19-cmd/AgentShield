import { describe, expect, it } from "vitest";
import { resolveAgent } from "./resolve";

const JENKINS = { id: "6f1c2d9e-8a4b-4c1e-9f3a-2b7d5e6a1c00", name: "jenkins-ci-agent" };
const DEMO = { id: "0d9c7a52-3b1e-4f6a-8c2d-91e0b4a7f311", name: "faculty-demo-agent" };
const AGENTS = [JENKINS, DEMO];

describe("resolveAgent", () => {
  it("matches the registry id", () => {
    expect(resolveAgent(DEMO.id, AGENTS)).toBe(DEMO);
  });

  it("matches the exact registered name when the agent sent its name", () => {
    expect(resolveAgent("jenkins-ci-agent", AGENTS)).toBe(JENKINS);
  });

  it("returns null when nothing matches, including near misses", () => {
    expect(resolveAgent("unknown-agent", AGENTS)).toBeNull();
    expect(resolveAgent("Jenkins-CI-Agent", AGENTS)).toBeNull();
    expect(resolveAgent(" jenkins-ci-agent", AGENTS)).toBeNull();
    expect(resolveAgent(JENKINS.id, [])).toBeNull();
  });

  it("prefers an id match over a name match", () => {
    const impostor = { id: "f0000000-0000-4000-8000-000000000000", name: DEMO.id };
    expect(resolveAgent(DEMO.id, [impostor, DEMO])).toBe(DEMO);
  });
});
