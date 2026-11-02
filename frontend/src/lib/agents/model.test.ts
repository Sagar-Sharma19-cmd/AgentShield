import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/api/client";
import {
  buildAgentsHref,
  countAgentsByStatus,
  describeAgentRegistryError,
  filterAgents,
  matchesAgentSearch,
  normalizeAgentSearch,
  parseAgentParams,
  sortAgentsNewestFirst,
} from "./model";
import type { AgentResponse } from "@/types/api";

const AGENT_ID = "11111111-2222-4333-8444-555555555555";

function agent(overrides: Partial<AgentResponse> & Pick<AgentResponse, "name">): AgentResponse {
  return {
    id: AGENT_ID,
    description: null,
    status: "ACTIVE",
    apiKeyPrefix: "agk_live_abcd",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

const FIXTURES = [
  agent({ name: "research-agent", description: "Reads source code", status: "ACTIVE" }),
  agent({ name: "deploy-bot", description: null, status: "SUSPENDED" }),
  agent({ name: "legacy-crawler", description: "Scrapes the Research wiki", status: "REVOKED", apiKeyPrefix: null }),
];

describe("parseAgentParams", () => {
  it("uses safe defaults when nothing is supplied", () => {
    expect(parseAgentParams({})).toEqual({ status: "ALL", agent: undefined });
  });

  it("accepts each known status filter", () => {
    expect(parseAgentParams({ status: "ACTIVE" }).status).toBe("ACTIVE");
    expect(parseAgentParams({ status: "SUSPENDED" }).status).toBe("SUSPENDED");
    expect(parseAgentParams({ status: "REVOKED" }).status).toBe("REVOKED");
    expect(parseAgentParams({ status: "ALL" }).status).toBe("ALL");
  });

  it("falls back to ALL for unknown, lower-case or empty status values", () => {
    expect(parseAgentParams({ status: "BOGUS" }).status).toBe("ALL");
    expect(parseAgentParams({ status: "active" }).status).toBe("ALL");
    expect(parseAgentParams({ status: "" }).status).toBe("ALL");
  });

  it("uses the first value when a parameter is repeated", () => {
    expect(parseAgentParams({ status: ["REVOKED", "ACTIVE"] }).status).toBe("REVOKED");
  });

  it("keeps a valid agent UUID and drops a malformed one", () => {
    expect(parseAgentParams({ agent: AGENT_ID }).agent).toBe(AGENT_ID);
    expect(parseAgentParams({ agent: "not-a-uuid" }).agent).toBeUndefined();
    expect(parseAgentParams({ agent: "<script>" }).agent).toBeUndefined();
  });

  it("ignores parameters this page does not own", () => {
    expect(parseAgentParams({ status: "ACTIVE", utm: "x" })).toEqual({ status: "ACTIVE", agent: undefined });
  });
});

describe("buildAgentsHref", () => {
  it("returns the bare path for the default view", () => {
    expect(buildAgentsHref({ status: "ALL" })).toBe("/agents");
  });

  it("writes the status and the selected agent", () => {
    expect(buildAgentsHref({ status: "SUSPENDED", agent: AGENT_ID })).toBe(
      `/agents?status=SUSPENDED&agent=${AGENT_ID}`,
    );
  });

  it("removes the status parameter when returning to ALL", () => {
    expect(buildAgentsHref({ status: "ALL" }, new URLSearchParams("status=ACTIVE"))).toBe("/agents");
  });

  it("keeps unrelated parameters when the filter changes", () => {
    expect(buildAgentsHref({ status: "ACTIVE" }, new URLSearchParams("utm=launch&status=REVOKED"))).toBe(
      "/agents?utm=launch&status=ACTIVE",
    );
  });

  it("removes the agent parameter when no agent is selected", () => {
    expect(buildAgentsHref({ status: "ALL" }, new URLSearchParams(`agent=${AGENT_ID}`))).toBe("/agents");
  });

  it("round-trips through parseAgentParams", () => {
    const href = buildAgentsHref({ status: "REVOKED", agent: AGENT_ID });
    const parsed = parseAgentParams(Object.fromEntries(new URL(href, "http://x").searchParams));
    expect(parsed).toEqual({ status: "REVOKED", agent: AGENT_ID });
  });
});

describe("agent search", () => {
  it("matches by name", () => {
    expect(matchesAgentSearch(FIXTURES[0], "research")).toBe(true);
    expect(matchesAgentSearch(FIXTURES[0], "deploy")).toBe(false);
  });

  it("matches by description", () => {
    expect(matchesAgentSearch(FIXTURES[0], "source code")).toBe(true);
  });

  it("is case-insensitive", () => {
    expect(matchesAgentSearch(FIXTURES[0], "RESEARCH-AGENT")).toBe(true);
    expect(matchesAgentSearch(FIXTURES[2], "wiki")).toBe(true);
    expect(matchesAgentSearch(FIXTURES[2], "WIKI")).toBe(true);
  });

  it("trims surrounding whitespace before matching", () => {
    expect(normalizeAgentSearch("   Deploy  ")).toBe("deploy");
    expect(matchesAgentSearch(FIXTURES[1], "   deploy   ")).toBe(true);
  });

  it("treats whitespace-only input as no search", () => {
    expect(matchesAgentSearch(FIXTURES[1], "   ")).toBe(true);
  });

  it("never matches a null description", () => {
    expect(matchesAgentSearch(FIXTURES[1], "reads")).toBe(false);
  });

  it("filters by search and status together", () => {
    expect(filterAgents(FIXTURES, { search: "research", status: "ACTIVE" }).map((a) => a.name)).toEqual([
      "research-agent",
    ]);
    expect(filterAgents(FIXTURES, { search: "research", status: "REVOKED" }).map((a) => a.name)).toEqual([
      "legacy-crawler",
    ]);
  });
});

describe("status filtering", () => {
  it("returns every agent for ALL", () => {
    expect(filterAgents(FIXTURES, { search: "", status: "ALL" })).toHaveLength(3);
  });

  it("returns only agents with the requested status", () => {
    expect(filterAgents(FIXTURES, { search: "", status: "SUSPENDED" }).map((a) => a.name)).toEqual(["deploy-bot"]);
  });

  it("counts the whole registry by status, independent of search", () => {
    expect(countAgentsByStatus(FIXTURES)).toEqual({ ALL: 3, ACTIVE: 1, SUSPENDED: 1, REVOKED: 1 });
    expect(countAgentsByStatus([])).toEqual({ ALL: 0, ACTIVE: 0, SUSPENDED: 0, REVOKED: 0 });
  });
});

describe("sortAgentsNewestFirst", () => {
  it("orders by creation time, newest first, and breaks ties by name", () => {
    const sorted = sortAgentsNewestFirst([
      agent({ name: "b-agent", createdAt: "2026-01-01T00:00:00Z" }),
      agent({ name: "c-agent", createdAt: "2026-03-01T00:00:00Z" }),
      agent({ name: "a-agent", createdAt: "2026-01-01T00:00:00Z" }),
    ]);
    expect(sorted.map((a) => a.name)).toEqual(["c-agent", "a-agent", "b-agent"]);
  });
});

describe("sortAgentsNewestFirst determinism", () => {
  it("breaks identical timestamps by name, then id, regardless of input order", () => {
    const same = "2026-01-01T00:00:00Z";
    const a = agent({ id: "00000000-0000-4000-8000-000000000002", name: "beta", createdAt: same });
    const b = agent({ id: "00000000-0000-4000-8000-000000000001", name: "alpha", createdAt: same });
    const c = agent({ id: "00000000-0000-4000-8000-000000000003", name: "beta", createdAt: same });
    const expected = ["alpha", "beta", "beta"];
    expect(sortAgentsNewestFirst([a, b, c]).map((x) => x.name)).toEqual(expected);
    expect(sortAgentsNewestFirst([c, b, a]).map((x) => x.name)).toEqual(expected);
    expect(sortAgentsNewestFirst([c, b, a]).map((x) => x.id)).toEqual(sortAgentsNewestFirst([a, b, c]).map((x) => x.id));
  });

  it("sorts an unparseable timestamp last and never returns NaN ordering", () => {
    const sorted = sortAgentsNewestFirst([
      agent({ name: "broken", createdAt: "not-a-date" }),
      agent({ name: "older", createdAt: "2025-01-01T00:00:00Z" }),
      agent({ name: "newer", createdAt: "2026-06-01T00:00:00Z" }),
    ]);
    expect(sorted.map((x) => x.name)).toEqual(["newer", "older", "broken"]);
  });

  it("does not mutate the input array", () => {
    const input = [agent({ name: "b" }), agent({ name: "a", createdAt: "2030-01-01T00:00:00Z" })];
    const snapshot = input.map((x) => x.name);
    sortAgentsNewestFirst(input);
    expect(input.map((x) => x.name)).toEqual(snapshot);
  });
});

describe("describeAgentRegistryError", () => {
  const LEAK = "An unexpected error occurred during security evaluation";
  const body = (message: string) => ({ timestamp: "2026-01-01T00:00:00Z", status: 0, error: "x", message, fieldErrors: {} });

  function copyOf(error: unknown) {
    const copy = describeAgentRegistryError(error);
    // Backend text must never reach the copy, whatever the status.
    expect(`${copy.title} ${copy.body}`).not.toContain(LEAK);
    return copy;
  }

  it("asks the operator to unlock on 401 and 403, with a fixed message", () => {
    expect(copyOf(new ApiError(401, body(LEAK))).action).toBe("unlock");
    expect(copyOf(new ApiError(403, null)).action).toBe("unlock");
    expect(copyOf(new ApiError(401, null)).title).toBe("AgentShield rejected the admin key");
  });

  it("describes 5xx as a server problem and offers retry, without the backend message", () => {
    for (const status of [500, 502, 503]) {
      const copy = copyOf(new ApiError(status, body(LEAK)));
      expect(copy.title).toBe("The agent registry is temporarily unavailable");
      expect(copy.action).toBe("retry");
    }
  });

  it("describes 404 as an endpoint problem, not as an empty registry", () => {
    const copy = copyOf(new ApiError(404, body("Agent not found.")));
    expect(copy.title).toBe("The agent registry could not be found");
    expect(copy.action).toBe("retry");
  });

  it("describes other 4xx responses without echoing the server text", () => {
    const copy = copyOf(new ApiError(400, body("Malformed JSON payload or invalid enumeration value provided")));
    expect(copy.title).toBe("The registry request was rejected");
    expect(copy.body).not.toContain("Malformed");
  });

  it("recognises a network failure by the TypeError fetch throws, not by message text", () => {
    const copy = copyOf(new TypeError("Failed to fetch"));
    expect(copy.title).toBe("AgentShield could not be reached");
    expect(copy.body).not.toContain("Failed to fetch");
    expect(copy.action).toBe("retry");
  });

  it("uses generic copy for any other error and never shows its message or stack", () => {
    const copy = copyOf(new Error("Admin key is not set. secret-token-123"));
    expect(copy.title).toBe("The agent registry could not be loaded");
    expect(`${copy.title} ${copy.body}`).not.toContain("secret-token-123");
    expect(copyOf("plain string").action).toBe("retry");
    expect(copyOf(undefined).action).toBe("retry");
  });
});
