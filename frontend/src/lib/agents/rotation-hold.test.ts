import { describe, expect, it } from "vitest";
import { isLeavingUnacknowledgedKey, resolveSheetAgent, type RotationHold } from "./rotation-hold";

const HELD = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";

const pending: RotationHold = { agentId: HELD, pending: true, keyOpen: false };
const keyOpen: RotationHold = { agentId: HELD, pending: false, keyOpen: true };

describe("resolveSheetAgent without a hold", () => {
  it("follows the URL and allows dismissal", () => {
    expect(resolveSheetAgent(HELD, null)).toEqual({ shownAgentId: HELD, dismissBlocked: false });
    expect(resolveSheetAgent(undefined, null)).toEqual({ shownAgentId: undefined, dismissBlocked: false });
  });
});

describe("resolveSheetAgent while a rotation is pending (unchanged behaviour)", () => {
  it("keeps the held agent shown when the URL has been cleared by Back", () => {
    expect(resolveSheetAgent(undefined, pending).shownAgentId).toBe(HELD);
  });

  it("keeps the held agent shown even if the URL moved to another agent", () => {
    expect(resolveSheetAgent(OTHER, pending).shownAgentId).toBe(HELD);
  });

  it("blocks dismissal, with or without a URL change", () => {
    expect(resolveSheetAgent(HELD, pending).dismissBlocked).toBe(true);
    expect(resolveSheetAgent(undefined, pending).dismissBlocked).toBe(true);
  });
});

describe("resolveSheetAgent while an issued key is unacknowledged", () => {
  it("keeps the agent shown when the URL leaves it (Back), without blocking the confirmation", () => {
    const view = resolveSheetAgent(undefined, keyOpen);
    expect(view).toEqual({ shownAgentId: HELD, dismissBlocked: false });
  });

  it("keeps the agent shown when the URL moves to another agent", () => {
    expect(resolveSheetAgent(OTHER, keyOpen).shownAgentId).toBe(HELD);
  });

  it("follows the URL while the URL still shows the held agent", () => {
    expect(resolveSheetAgent(HELD, keyOpen)).toEqual({ shownAgentId: HELD, dismissBlocked: false });
  });
});

describe("resolveSheetAgent once the key is acknowledged or discarded", () => {
  it("closes when the URL has moved on and no hold remains", () => {
    expect(resolveSheetAgent(undefined, null).shownAgentId).toBeUndefined();
  });

  it("restores normal dismissal straight away after a failed rotation (no hold is set)", () => {
    expect(resolveSheetAgent(HELD, null)).toEqual({ shownAgentId: HELD, dismissBlocked: false });
  });
});

describe("isLeavingUnacknowledgedKey", () => {
  it("is false with no hold", () => {
    expect(isLeavingUnacknowledgedKey(HELD, null, false)).toBe(false);
    expect(isLeavingUnacknowledgedKey(HELD, null, true)).toBe(false);
  });

  it("is false while the rotation is still pending (no key yet)", () => {
    expect(isLeavingUnacknowledgedKey(undefined, pending, true)).toBe(false);
  });

  it("is true when the URL leaves the agent holding the unacknowledged key", () => {
    expect(isLeavingUnacknowledgedKey(undefined, keyOpen, false)).toBe(true);
    expect(isLeavingUnacknowledgedKey(OTHER, keyOpen, false)).toBe(true);
  });

  it("is true when the operator tried to leave with Escape, outside click or close", () => {
    expect(isLeavingUnacknowledgedKey(HELD, keyOpen, true)).toBe(true);
  });

  it("is false when the URL still shows the agent and no leave was requested", () => {
    expect(isLeavingUnacknowledgedKey(HELD, keyOpen, false)).toBe(false);
  });
});
