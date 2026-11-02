import { describe, expect, it } from "vitest";
import {
  availableLifecycleActions,
  isLifecycleActionAvailable,
  isRevokeConfirmed,
  targetStatusFor,
  type LifecycleAction,
} from "./lifecycle";
import type { AgentStatus } from "@/types/api";

const ALL_ACTIONS: LifecycleAction[] = ["suspend", "reactivate", "revoke", "rotate"];

/** Expected availability for every status and action, written out so a rule change must be made here too. */
const EXPECTED: Record<AgentStatus, Record<LifecycleAction, boolean>> = {
  ACTIVE: { suspend: true, reactivate: false, revoke: true, rotate: true },
  SUSPENDED: { suspend: false, reactivate: true, revoke: true, rotate: true },
  REVOKED: { suspend: false, reactivate: false, revoke: false, rotate: false },
};

describe("isLifecycleActionAvailable: every status and action combination", () => {
  const cases = (Object.keys(EXPECTED) as AgentStatus[]).flatMap((status) =>
    ALL_ACTIONS.map((action) => [status, action, EXPECTED[status][action]] as const),
  );

  it.each(cases)("%s + %s is %s", (status, action, expected) => {
    expect(isLifecycleActionAvailable(status, action)).toBe(expected);
  });

  it("covers exactly 12 combinations", () => {
    expect(cases).toHaveLength(12);
  });
});

describe("availableLifecycleActions", () => {
  it("lists the actions for ACTIVE agents in display order", () => {
    expect(availableLifecycleActions("ACTIVE")).toEqual(["suspend", "revoke", "rotate"]);
  });

  it("lists the actions for SUSPENDED agents in display order", () => {
    expect(availableLifecycleActions("SUSPENDED")).toEqual(["reactivate", "revoke", "rotate"]);
  });

  it("offers nothing for REVOKED agents", () => {
    expect(availableLifecycleActions("REVOKED")).toEqual([]);
  });

  it("agrees with isLifecycleActionAvailable for every combination", () => {
    for (const status of Object.keys(EXPECTED) as AgentStatus[]) {
      for (const action of ALL_ACTIONS) {
        expect(availableLifecycleActions(status).includes(action)).toBe(isLifecycleActionAvailable(status, action));
      }
    }
  });
});

describe("targetStatusFor", () => {
  it("maps each status-changing action to its status", () => {
    expect(targetStatusFor("suspend")).toBe("SUSPENDED");
    expect(targetStatusFor("reactivate")).toBe("ACTIVE");
    expect(targetStatusFor("revoke")).toBe("REVOKED");
  });

  it("returns null for rotation, which changes the key and not the status", () => {
    expect(targetStatusFor("rotate")).toBeNull();
  });
});

describe("isRevokeConfirmed", () => {
  const NAME = "research-agent";

  it("accepts the exact registered name", () => {
    expect(isRevokeConfirmed(NAME, "research-agent")).toBe(true);
  });

  it("rejects a case mismatch", () => {
    expect(isRevokeConfirmed(NAME, "Research-Agent")).toBe(false);
    expect(isRevokeConfirmed(NAME, "RESEARCH-AGENT")).toBe(false);
  });

  it("rejects a partial name", () => {
    expect(isRevokeConfirmed(NAME, "research")).toBe(false);
    expect(isRevokeConfirmed(NAME, "research-agen")).toBe(false);
  });

  it("rejects a longer name that starts with the registered name", () => {
    expect(isRevokeConfirmed(NAME, "research-agent-2")).toBe(false);
  });

  it("does not trim: surrounding whitespace is a mismatch", () => {
    expect(isRevokeConfirmed(NAME, " research-agent")).toBe(false);
    expect(isRevokeConfirmed(NAME, "research-agent ")).toBe(false);
    expect(isRevokeConfirmed(NAME, "research-agent\n")).toBe(false);
  });

  it("rejects an empty typed value", () => {
    expect(isRevokeConfirmed(NAME, "")).toBe(false);
  });

  it("never passes when the registered name is empty", () => {
    expect(isRevokeConfirmed("", "")).toBe(false);
    expect(isRevokeConfirmed("", " ")).toBe(false);
  });

  it("does not normalise Unicode look-alikes", () => {
    expect(isRevokeConfirmed(NAME, "research‑agent")).toBe(false); // non-breaking hyphen
  });
});
