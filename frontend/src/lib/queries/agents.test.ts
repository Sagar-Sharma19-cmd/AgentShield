import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { dashboardKeys } from "./dashboard";
import { agentKeys, refreshAgentRegistry } from "./agents";
import { reviewKeys } from "./reviews";

describe("refreshAgentRegistry", () => {
  it("invalidates the registry and dashboard agent keys, and nothing else", async () => {
    const queryClient = new QueryClient();
    const registry = agentKeys.registry();
    const dashboardAgents = dashboardKeys.agents();
    const grants = agentKeys.grants("11111111-2222-4333-8444-555555555555");
    const reviewList = reviewKeys.list("PENDING");
    const decisionCounts = dashboardKeys.decisionCounts();
    for (const key of [registry, dashboardAgents, grants, reviewList, decisionCounts]) {
      queryClient.setQueryData(key, []);
    }

    await refreshAgentRegistry(queryClient);

    expect(queryClient.getQueryState(registry)?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(dashboardAgents)?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(grants)?.isInvalidated).toBe(false);
    expect(queryClient.getQueryState(reviewList)?.isInvalidated).toBe(false);
    expect(queryClient.getQueryState(decisionCounts)?.isInvalidated).toBe(false);
  });
});
