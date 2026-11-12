import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/api/client";
import {
  availableReviewActions,
  buildDecisionBody,
  buildReviewHref,
  NOTE_MAX,
  REVIEWER_MAX,
  describeActionError,
  initialConfirmation,
  parseReviewParams,
  grantRequestFor,
  resolveAgentLookup,
  sortNewestFirst,
  transitionLabel,
} from "./model";

const VALID_ID = "11111111-2222-4333-8444-555555555555";

describe("availableReviewActions", () => {
  it("only allows start from PENDING, mirroring the backend state machine", () => {
    expect(availableReviewActions("PENDING")).toEqual(["start"]);
  });

  it("allows approve and reject only from IN_REVIEW", () => {
    expect(availableReviewActions("IN_REVIEW")).toEqual(["approve", "reject"]);
  });

  it("offers no action from the terminal statuses", () => {
    expect(availableReviewActions("APPROVED")).toEqual([]);
    expect(availableReviewActions("REJECTED")).toEqual([]);
  });

  it("never offers approve from PENDING (the backend refuses it)", () => {
    expect(availableReviewActions("PENDING")).not.toContain("approve");
    expect(availableReviewActions("PENDING")).not.toContain("reject");
  });
});

describe("sortNewestFirst", () => {
  it("orders by createdAt descending without mutating the input", () => {
    const input = [
      { id: "a", createdAt: "2026-01-01T00:00:00Z" },
      { id: "c", createdAt: "2026-03-01T00:00:00Z" },
      { id: "b", createdAt: "2026-02-01T00:00:00Z" },
    ];
    expect(sortNewestFirst(input).map((r) => r.id)).toEqual(["c", "b", "a"]);
    expect(input.map((r) => r.id)).toEqual(["a", "c", "b"]);
  });
});

describe("parseReviewParams", () => {
  it("defaults to PENDING with no selection", () => {
    expect(parseReviewParams({})).toEqual({ status: "PENDING" });
  });

  it("accepts a valid status and review id", () => {
    expect(parseReviewParams({ status: "IN_REVIEW", review: VALID_ID })).toEqual({
      status: "IN_REVIEW",
      review: VALID_ID,
    });
  });

  it("falls back to PENDING for an unknown status and drops a malformed review id", () => {
    expect(parseReviewParams({ status: "APPROVE_ALL", review: "not-a-uuid" })).toEqual({ status: "PENDING" });
  });

  it("takes the first value when a parameter is repeated", () => {
    expect(parseReviewParams({ status: ["REJECTED", "PENDING"] })).toEqual({ status: "REJECTED" });
  });

  it("accepts a confirm request for a selected review", () => {
    expect(parseReviewParams({ status: "IN_REVIEW", review: VALID_ID, confirm: "reject" })).toEqual({
      status: "IN_REVIEW",
      review: VALID_ID,
      confirm: "reject",
    });
  });

  it("drops an unknown confirm value and any confirm without a selected review", () => {
    expect(parseReviewParams({ status: "IN_REVIEW", review: VALID_ID, confirm: "start" })).toEqual({
      status: "IN_REVIEW",
      review: VALID_ID,
    });
    expect(parseReviewParams({ status: "IN_REVIEW", confirm: "approve" })).toEqual({ status: "IN_REVIEW" });
  });
});

describe("buildReviewHref", () => {
  it("omits the review parameter when nothing is selected", () => {
    expect(buildReviewHref({ status: "APPROVED" })).toBe("/reviews?status=APPROVED");
  });

  it("includes the selected review id", () => {
    expect(buildReviewHref({ status: "IN_REVIEW", review: VALID_ID })).toBe(
      `/reviews?status=IN_REVIEW&review=${VALID_ID}`,
    );
  });

  it("adds a confirm request only alongside a selected review", () => {
    expect(buildReviewHref({ status: "IN_REVIEW", review: VALID_ID, confirm: "approve" })).toBe(
      `/reviews?status=IN_REVIEW&review=${VALID_ID}&confirm=approve`,
    );
    expect(buildReviewHref({ status: "IN_REVIEW", confirm: "approve" })).toBe("/reviews?status=IN_REVIEW");
  });
});

describe("initialConfirmation", () => {
  it("pre-opens only an action the current status allows", () => {
    expect(initialConfirmation("IN_REVIEW", "approve")).toBe("approve");
    expect(initialConfirmation("IN_REVIEW", "reject")).toBe("reject");
    expect(initialConfirmation("PENDING", "approve")).toBeNull();
    expect(initialConfirmation("APPROVED", "reject")).toBeNull();
    expect(initialConfirmation("IN_REVIEW", undefined)).toBeNull();
  });
});

describe("transitionLabel", () => {
  it("describes the status change for the feedback line", () => {
    expect(transitionLabel("IN_REVIEW", "APPROVED")).toBe("In review → Approved");
  });
});

describe("describeActionError", () => {
  it("keeps the backend's refused-transition message and says the review was refreshed", () => {
    const text = describeActionError(
      new ApiError(400, { timestamp: "", status: 400, error: "Bad Request", message: "Cannot move review request from APPROVED to APPROVED.", fieldErrors: {} }),
    );
    expect(text).toContain("Cannot move review request from APPROVED to APPROVED.");
    expect(text).toContain("refreshed");
  });

  it("asks the operator to re-unlock on a rejected key", () => {
    expect(describeActionError(new ApiError(401, null))).toContain("rejected the admin key");
  });

  it("reports a missing review plainly", () => {
    expect(describeActionError(new ApiError(404, null))).toBe("This review no longer exists.");
  });

  it("gives a generic message for network failures", () => {
    expect(describeActionError(new TypeError("fetch failed"))).toContain("could not be saved");
  });
});

describe("resolveAgentLookup", () => {
  const agent = {
    id: "agent-1",
    name: "Deploy bot",
    description: null,
    status: "ACTIVE" as const,
    apiKeyPrefix: null,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  };

  it("reports loading while the registry request is in flight, even if the agent is not known yet", () => {
    expect(resolveAgentLookup({ state: "loading" }, "agent-1")).toEqual({ kind: "loading" });
  });

  it("reports error when the registry failed, so absence is not claimed", () => {
    expect(resolveAgentLookup({ state: "error" }, "agent-1")).toEqual({ kind: "error" });
  });

  it("reports absent only when the registry loaded and does not contain the agent", () => {
    expect(resolveAgentLookup({ state: "ready", agents: [agent] }, "agent-2")).toEqual({ kind: "absent" });
  });

  it("returns the agent when the registry loaded and contains it", () => {
    expect(resolveAgentLookup({ state: "ready", agents: [agent] }, "agent-1")).toEqual({ kind: "found", agent });
  });

  it("finds an agent that sent its name instead of its id", () => {
    expect(resolveAgentLookup({ state: "ready", agents: [agent] }, "Deploy bot")).toEqual({ kind: "found", agent });
  });
});

describe("grantRequestFor (the grant section only ever requests a resolved UUID)", () => {
  const agent = {
    id: "11111111-2222-4333-8444-555555555555",
    name: "jenkins-ci-agent",
    description: null,
    status: "ACTIVE" as const,
    apiKeyPrefix: null,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  };

  it("fetches with the registry UUID, even when the review named the agent", () => {
    const resolution = resolveAgentLookup({ state: "ready", agents: [agent] }, "jenkins-ci-agent");
    expect(grantRequestFor(resolution)).toEqual({ kind: "fetch", agentId: agent.id });
  });

  it("skips the request with a calm note when the agent is not in the registry", () => {
    const request = grantRequestFor(resolveAgentLookup({ state: "ready", agents: [agent] }, "someone-else"));
    expect(request.kind).toBe("skip");
    expect(request).not.toHaveProperty("agentId");
    expect(request.kind === "skip" && request.note).toMatch(/not in the agent registry/);
  });

  it("waits while the registry loads, and skips if it failed", () => {
    expect(grantRequestFor({ kind: "loading" })).toEqual({ kind: "waiting" });
    expect(grantRequestFor({ kind: "error" }).kind).toBe("skip");
  });
});

describe("buildDecisionBody", () => {
  it("approve: reviewer required, note optional and omitted when empty, both trimmed", () => {
    expect(buildDecisionBody("approve", { reviewer: "  alice ", note: "  " })).toEqual({ ok: true, body: { reviewer: "alice" } });
    expect(buildDecisionBody("approve", { reviewer: "alice", note: " ok " })).toEqual({
      ok: true,
      body: { reviewer: "alice", note: "ok" },
    });
    const missing = buildDecisionBody("approve", { reviewer: "   ", note: "" });
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.errors.reviewer).toBeDefined();
  });

  it("reject: note required", () => {
    const result = buildDecisionBody("reject", { reviewer: "bob", note: "" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.note).toBeDefined();
      expect(result.errors.reviewer).toBeUndefined();
    }
    expect(buildDecisionBody("reject", { reviewer: "bob", note: "Unsafe." })).toEqual({
      ok: true,
      body: { reviewer: "bob", note: "Unsafe." },
    });
  });

  it("enforces the backend length limits", () => {
    const long = buildDecisionBody("approve", { reviewer: "x".repeat(REVIEWER_MAX + 1), note: "n".repeat(NOTE_MAX + 1) });
    expect(long.ok).toBe(false);
    if (!long.ok) {
      expect(long.errors.reviewer).toBeDefined();
      expect(long.errors.note).toBeDefined();
    }
    expect(buildDecisionBody("approve", { reviewer: "x".repeat(REVIEWER_MAX), note: "n".repeat(NOTE_MAX) }).ok).toBe(true);
  });
});

describe("describeActionError: 409", () => {
  it("passes the backend message through, for example an expired review", () => {
    const message = "Review request expired at 2026-11-10T12:30:00Z.";
    expect(describeActionError(new ApiError(409, { message } as never))).toContain(message);
  });
});
