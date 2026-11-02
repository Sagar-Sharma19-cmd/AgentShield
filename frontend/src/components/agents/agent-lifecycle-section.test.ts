import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AgentLifecycleSection } from "@/components/agents/agent-lifecycle-section";
import { AdminKeyProvider } from "@/lib/auth/admin-key";
import type { AgentResponse, AgentStatus } from "@/types/api";

// Server render only: the environment is node (no DOM), so interactions are verified in the browser.
// This checks which controls each status shows, and that nothing secret is rendered before a rotation.

const FAKE_KEY = "agk_live_FAKEFAKEFAKEFAKE";

function agentWith(status: AgentStatus): AgentResponse {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    name: "research-agent",
    description: "Reads source code",
    status,
    apiKeyPrefix: status === "REVOKED" ? null : "agk_live_ab12",
    createdAt: "2026-02-01T10:00:00Z",
    updatedAt: "2026-02-01T10:00:00Z",
  } as AgentResponse;
}

function renderSection(status: AgentStatus): string {
  return renderToStaticMarkup(
    createElement(
      QueryClientProvider,
      { client: new QueryClient() },
      createElement(AdminKeyProvider, null, createElement(AgentLifecycleSection, { agent: agentWith(status) })),
    ),
  );
}

/** Visible text of every button in the rendered markup, in document order. */
function buttonLabels(markup: string): string[] {
  return [...markup.matchAll(/<button[^>]*>([^<]*)<\/button>/g)].map((match) => match[1]);
}

describe("AgentLifecycleSection controls by status", () => {
  it("shows suspend, revoke and rotate for an ACTIVE agent", () => {
    expect(buttonLabels(renderSection("ACTIVE"))).toEqual(["Suspend", "Revoke", "Rotate key"]);
  });

  it("shows reactivate, revoke and rotate for a SUSPENDED agent", () => {
    expect(buttonLabels(renderSection("SUSPENDED"))).toEqual(["Reactivate", "Revoke", "Rotate key"]);
  });

  it("shows no lifecycle buttons for a REVOKED agent, and says why", () => {
    const markup = renderSection("REVOKED");
    expect(buttonLabels(markup)).toEqual([]);
    expect(markup).toContain("no lifecycle changes are available");
  });

  it("renders no confirmation or key dialog before anything is requested", () => {
    const markup = renderSection("ACTIVE");
    expect(markup).not.toContain("New API key for");
    expect(markup).not.toContain("Revoke research-agent permanently");
    expect(markup).not.toContain(FAKE_KEY);
  });
});
