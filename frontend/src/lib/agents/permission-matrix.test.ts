import { describe, expect, it } from "vitest";
import type { ActionType, PermissionResponse, ToolResponse } from "@/types/api";
import { buildPermissionMatrix, cellLabel, summarizeMatrix } from "./permission-matrix";

const tool = (id: string, name: string, status: ToolResponse["status"] = "ACTIVE") => ({
  id,
  name,
  toolType: "FILESYSTEM" as const,
  status,
});

const grant = (toolId: string, toolName: string, allowedActions: ActionType[], enabled = true): PermissionResponse => ({
  id: `g-${toolId}`,
  agentId: "a",
  agentName: "agent",
  toolId,
  toolName,
  allowedActions,
  enabled,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
});

describe("buildPermissionMatrix", () => {
  it("has one row per registered tool, sorted by name, with granted and not-granted cells", () => {
    const rows = buildPermissionMatrix(
      [tool("2", "github"), tool("1", "filesystem")],
      [grant("1", "filesystem", ["READ", "DELETE"])],
      "ACTIVE",
    );
    expect(rows.map((row) => row.toolName)).toEqual(["filesystem", "github"]);
    expect(rows[0].cells).toEqual({
      READ: "granted",
      WRITE: "not-granted",
      DELETE: "granted",
      EXECUTE: "not-granted",
      EXTERNAL_REQUEST: "not-granted",
    });
    expect(rows[0].block).toBeNull();
    expect(rows[1].grant).toBeNull();
    expect(Object.values(rows[1].cells).every((state) => state === "not-granted")).toBe(true);
  });

  it("marks granted actions as not in effect, giving the first failing check", () => {
    const tools = [tool("1", "fs", "DISABLED"), tool("2", "gh")];
    const grants = [grant("1", "fs", ["READ"]), grant("2", "gh", ["WRITE"], false)];

    const active = buildPermissionMatrix(tools, grants, "ACTIVE");
    expect(active.map((row) => row.block)).toEqual(["TOOL_DISABLED", "GRANT_DISABLED"]);
    expect(active[0].cells.READ).toBe("granted-blocked");
    expect(active[0].cells.WRITE).toBe("not-granted");

    expect(buildPermissionMatrix(tools, grants, "SUSPENDED").map((row) => row.block)).toEqual([
      "AGENT_SUSPENDED",
      "AGENT_SUSPENDED",
    ]);
    expect(buildPermissionMatrix(tools, grants, "REVOKED")[0].block).toBe("AGENT_REVOKED");
  });

  it("does not block a row while the agent's status is still loading", () => {
    expect(buildPermissionMatrix([tool("1", "fs")], [grant("1", "fs", ["READ"])], undefined)[0].cells.READ).toBe("granted");
  });

  it("keeps a grant whose tool is missing from the tool list, with unknown type and status", () => {
    const rows = buildPermissionMatrix([], [grant("9", "orphan", ["EXECUTE"])], "ACTIVE");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ toolName: "orphan", toolType: null, toolStatus: null, block: null });
    expect(rows[0].cells.EXECUTE).toBe("granted");
  });
});

describe("cellLabel", () => {
  it("gives text for every state, so the cell never relies on colour", () => {
    expect(cellLabel("READ", "granted", null)).toBe("Read: granted");
    expect(cellLabel("WRITE", "not-granted", null)).toBe("Write: not granted");
    expect(cellLabel("DELETE", "granted-blocked", "TOOL_DISABLED")).toBe("Delete: granted, not in effect (tool disabled)");
  });
});

describe("summarizeMatrix", () => {
  it("counts granted tools, granted actions and actions in effect", () => {
    const rows = buildPermissionMatrix(
      [tool("1", "fs"), tool("2", "gh", "DISABLED"), tool("3", "db")],
      [grant("1", "fs", ["READ", "WRITE"]), grant("2", "gh", ["READ"])],
      "ACTIVE",
    );
    expect(summarizeMatrix(rows)).toEqual({ tools: 3, grantedTools: 2, grantedActions: 3, effectiveActions: 2 });
  });
});
