import { describe, expect, it } from "vitest";
import type { PermissionResponse, ToolResponse } from "@/types/api";
import { grantableTools, toggleAction, validatePermissionGrant } from "./permission-grant";

const tool = (id: string): ToolResponse => ({
  id,
  name: `tool-${id}`,
  description: null,
  toolType: "OTHER",
  status: "ACTIVE",
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
});

const grant = (toolId: string): PermissionResponse => ({
  id: `g-${toolId}`,
  agentId: "a",
  agentName: "agent",
  toolId,
  toolName: `tool-${toolId}`,
  allowedActions: ["READ"],
  enabled: true,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
});

describe("grantableTools", () => {
  it("removes tools the agent already has a grant for", () => {
    expect(grantableTools([tool("1"), tool("2"), tool("3")], [grant("2")]).map((item) => item.id)).toEqual(["1", "3"]);
  });
});

describe("validatePermissionGrant", () => {
  it("requires a tool and at least one action", () => {
    const result = validatePermissionGrant({ toolId: "", actions: [], enabled: true });
    expect(result.value).toBeNull();
    expect(result.errors).toEqual({ toolId: "Choose a tool.", actions: "Select at least one action." });
  });

  it("returns actions in backend order without duplicates", () => {
    expect(
      validatePermissionGrant({ toolId: "t", actions: ["EXECUTE", "READ", "EXECUTE"], enabled: false }).value,
    ).toEqual({ toolId: "t", allowedActions: ["READ", "EXECUTE"], enabled: false });
  });
});

describe("toggleAction", () => {
  it("adds and removes an action without mutating the input", () => {
    const start = ["READ" as const];
    expect(toggleAction(start, "WRITE")).toEqual(["READ", "WRITE"]);
    expect(toggleAction(start, "READ")).toEqual([]);
    expect(start).toEqual(["READ"]);
  });
});
