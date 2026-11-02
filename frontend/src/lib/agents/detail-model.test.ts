import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/api/client";
import {
  buildAgentActivityHref,
  describeAgentActionError,
  describeAgentDetailError,
  describeAgentStatusEffect,
  isAgentNotFound,
  sortGrantsForDisplay,
} from "./detail-model";
import type { PermissionResponse } from "@/types/api";

const AGENT_ID = "11111111-2222-4333-8444-555555555555";
const LEAK = "An unexpected error occurred during security evaluation";

function grant(id: string, toolName: string): Pick<PermissionResponse, "id" | "toolName"> {
  return { id, toolName };
}

describe("sortGrantsForDisplay", () => {
  it("sorts by tool name, then grant id, regardless of input order", () => {
    const a = grant("b-id", "search");
    const b = grant("a-id", "deploy");
    const c = grant("c-id", "search");
    expect(sortGrantsForDisplay([a, b, c]).map((g) => `${g.toolName}:${g.id}`)).toEqual([
      "deploy:a-id",
      "search:b-id",
      "search:c-id",
    ]);
    expect(sortGrantsForDisplay([c, a, b]).map((g) => g.id)).toEqual(sortGrantsForDisplay([a, b, c]).map((g) => g.id));
  });

  it("does not mutate its input", () => {
    const input = [grant("1", "zeta"), grant("2", "alpha")];
    sortGrantsForDisplay(input);
    expect(input.map((g) => g.toolName)).toEqual(["zeta", "alpha"]);
  });
});

describe("describeAgentStatusEffect", () => {
  it("marks grants usable only for ACTIVE agents", () => {
    expect(describeAgentStatusEffect("ACTIVE").grantsUsable).toBe(true);
    expect(describeAgentStatusEffect("SUSPENDED").grantsUsable).toBe(false);
    expect(describeAgentStatusEffect("REVOKED").grantsUsable).toBe(false);
  });

  it("explains suspension as denial with the key kept", () => {
    const effect = describeAgentStatusEffect("SUSPENDED");
    expect(effect.summary).toContain("denied while it is suspended");
    expect(effect.summary).toContain("Its key is kept");
    expect(effect.grantsNote).toContain("not currently usable");
  });

  it("explains revocation as key removal", () => {
    const effect = describeAgentStatusEffect("REVOKED");
    expect(effect.summary).toContain("Its key was removed");
    expect(effect.grantsNote).toContain("not usable");
    expect(describeAgentStatusEffect("ACTIVE").grantsNote).toBeUndefined();
  });
});

describe("buildAgentActivityHref", () => {
  it("links to the Activity Explorer filtered by this agent only", () => {
    expect(buildAgentActivityHref(AGENT_ID)).toBe(`/activity?agentId=${AGENT_ID}`);
  });
});

describe("isAgentNotFound", () => {
  it("is true only for a 404 API error", () => {
    expect(isAgentNotFound(new ApiError(404, null))).toBe(true);
    expect(isAgentNotFound(new ApiError(500, null))).toBe(false);
    expect(isAgentNotFound(new TypeError("Failed to fetch"))).toBe(false);
    expect(isAgentNotFound(undefined)).toBe(false);
  });
});

describe("describeAgentDetailError", () => {
  function copyOf(error: unknown, subject: "agent" | "grants") {
    const copy = describeAgentDetailError(error, subject);
    expect(`${copy.title} ${copy.body}`).not.toContain(LEAK);
    return copy;
  }

  it("uses subject-specific titles for server errors", () => {
    expect(copyOf(new ApiError(500, null), "agent").title).toBe("Agent details are temporarily unavailable");
    expect(copyOf(new ApiError(503, null), "grants").title).toBe("Permission grants are temporarily unavailable");
  });

  it("asks for an unlock on 401 and 403 without the backend text", () => {
    const copy = copyOf(new ApiError(401, { timestamp: "", status: 401, error: "", message: "Invalid admin API key", fieldErrors: {} }), "agent");
    expect(copy.action).toBe("unlock");
    expect(copy.body).not.toContain("Invalid admin API key");
    expect(copyOf(new ApiError(403, null), "grants").action).toBe("unlock");
  });

  it("describes network failures by TypeError, not by text", () => {
    const copy = copyOf(new TypeError("Failed to fetch"), "grants");
    expect(copy.title).toBe("AgentShield could not be reached");
    expect(copy.body).not.toContain("Failed to fetch");
  });

  it("uses generic copy for unknown errors and never shows their message", () => {
    const copy = copyOf(new Error("secret-token-123"), "agent");
    expect(copy.title).toBe("Agent details could not be loaded");
    expect(`${copy.title} ${copy.body}`).not.toContain("secret-token-123");
  });

  it("gives 4xx rejections a subject-specific title and retry", () => {
    const copy = copyOf(new ApiError(400, null), "grants");
    expect(copy.title).toBe("The request for permission grants was rejected");
    expect(copy.action).toBe("retry");
  });
});

describe("describeAgentActionError", () => {
  const SECRET = "agk_live_FAKEFAKEFAKEFAKE";
  const leaky = (status: number) =>
    new ApiError(status, { timestamp: "", status, error: "", message: `backend said ${SECRET}`, fieldErrors: {} });

  it("asks for an unlock on 401 and 403", () => {
    expect(describeAgentActionError(new ApiError(401, null))).toContain("Lock the console and unlock it again");
    expect(describeAgentActionError(new ApiError(403, null))).toContain("Lock the console and unlock it again");
  });

  it("explains that a revoked agent cannot be changed on 409", () => {
    const message = describeAgentActionError(new ApiError(409, null));
    expect(message).toContain("revoked");
    expect(message).toContain("Revocation is permanent");
  });

  it("maps 404 to a refresh prompt", () => {
    expect(describeAgentActionError(new ApiError(404, null))).toBe(
      "This agent could not be found. Refresh the registry and try again.",
    );
  });

  it("maps 5xx to a retry prompt", () => {
    expect(describeAgentActionError(new ApiError(500, null))).toBe(
      "AgentShield could not complete the change. Try again in a moment.",
    );
    expect(describeAgentActionError(new ApiError(503, null))).toBe(
      "AgentShield could not complete the change. Try again in a moment.",
    );
  });

  it("gives other ApiError statuses the generic not-made message", () => {
    expect(describeAgentActionError(new ApiError(400, null))).toBe("The change was not made. Refresh and try again.");
  });

  it("describes network failures by TypeError", () => {
    expect(describeAgentActionError(new TypeError("Failed to fetch"))).toBe(
      "AgentShield could not be reached. Check the connection and try again.",
    );
  });

  it("falls back to a generic message for unknown errors", () => {
    expect(describeAgentActionError(new Error("boom"))).toBe("The change could not be completed.");
    expect(describeAgentActionError(undefined)).toBe("The change could not be completed.");
  });

  it("never includes backend message text or key-shaped values", () => {
    for (const status of [400, 401, 403, 404, 409, 500]) {
      const message = describeAgentActionError(leaky(status));
      expect(message).not.toContain(SECRET);
      expect(message).not.toContain("backend said");
    }
  });
});
