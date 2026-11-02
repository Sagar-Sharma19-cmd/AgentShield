import { describe, expect, it } from "vitest";
import { countRecordedDecisions, simulatorRowsOnly } from "./results";

describe("countRecordedDecisions", () => {
  it("counts each decision and reports zero for absent ones", () => {
    expect(countRecordedDecisions([{ decision: "ALLOW" }, { decision: "DENY" }, { decision: "ALLOW" }])).toEqual({
      ALLOW: 2,
      REVIEW: 0,
      DENY: 1,
    });
  });
});

describe("simulatorRowsOnly", () => {
  it("drops rows for tools the simulator does not use", () => {
    const rows = [{ tool: "github" }, { tool: "ghost-a" }, { tool: "docker" }];
    expect(simulatorRowsOnly(rows, ["github", "docker"])).toEqual([{ tool: "github" }, { tool: "docker" }]);
  });
});
