import { describe, expect, it } from "vitest";
import { AGENT_STATUS_LABELS } from "./labels";
import { AGENT_STATUSES } from "./agents/model";

describe("AGENT_STATUS_LABELS", () => {
  it("uses the operator-facing names for each backend status", () => {
    expect(AGENT_STATUS_LABELS).toEqual({ ACTIVE: "Active", SUSPENDED: "Suspended", REVOKED: "Revoked" });
  });

  it("covers every status the registry filters on", () => {
    expect(Object.keys(AGENT_STATUS_LABELS).sort()).toEqual([...AGENT_STATUSES].sort());
  });
});
