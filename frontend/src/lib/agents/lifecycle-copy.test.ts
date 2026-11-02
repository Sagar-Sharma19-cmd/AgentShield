import { describe, expect, it } from "vitest";
import { canConfirmLifecycleAction, lifecycleConfirmCopy, LIFECYCLE_BUTTON_LABELS } from "./lifecycle-copy";
import type { LifecycleAction } from "./lifecycle";

const NAME = "research-agent";

describe("lifecycleConfirmCopy", () => {
  it("never claims that revocation can be undone, and says it is permanent", () => {
    const text = lifecycleConfirmCopy("revoke", NAME, "ACTIVE").paragraphs.join(" ");
    expect(text).toContain("permanent");
    expect(text).toContain("cannot be undone");
    expect(text).toMatch(/destroyed/);
  });

  it("says revoked grants stay assigned but unusable", () => {
    const text = lifecycleConfirmCopy("revoke", NAME, "SUSPENDED").paragraphs.join(" ");
    expect(text).toContain("stay assigned");
    expect(text).toContain("cannot be used");
  });

  it("explains that suspension keeps the key and the grants", () => {
    const text = lifecycleConfirmCopy("suspend", NAME, "ACTIVE").paragraphs.join(" ");
    expect(text).toContain("API key is kept");
    expect(text).toContain("grants stay assigned");
  });

  it("states that reactivation does not delete or recreate grants", () => {
    const text = lifecycleConfirmCopy("reactivate", NAME, "SUSPENDED").paragraphs.join(" ");
    expect(text).toContain("No grants are deleted or recreated");
  });

  it("warns that the old rotated key stops working immediately", () => {
    const text = lifecycleConfirmCopy("rotate", NAME, "ACTIVE").paragraphs.join(" ");
    expect(text).toContain("stops working as soon as the new key is issued");
  });

  it("says rotating a suspended agent's key does not reactivate it", () => {
    const suspended = lifecycleConfirmCopy("rotate", NAME, "SUSPENDED").paragraphs.join(" ");
    expect(suspended).toContain("does not reactivate it");
    const active = lifecycleConfirmCopy("rotate", NAME, "ACTIVE").paragraphs.join(" ");
    expect(active).not.toContain("does not reactivate it");
  });

  it("requires a typed name only for revoke", () => {
    const actions: LifecycleAction[] = ["suspend", "reactivate", "revoke", "rotate"];
    expect(actions.map((action) => lifecycleConfirmCopy(action, NAME, "ACTIVE").requiresTypedName)).toEqual([
      false,
      false,
      true,
      false,
    ]);
  });

  it("puts the agent name in every title", () => {
    for (const action of ["suspend", "reactivate", "revoke", "rotate"] as const) {
      expect(lifecycleConfirmCopy(action, NAME, "ACTIVE").title).toContain(NAME);
    }
  });

  it("gives every action a button label and a distinct pending label", () => {
    expect(Object.values(LIFECYCLE_BUTTON_LABELS)).toEqual(["Suspend", "Reactivate", "Revoke", "Rotate key"]);
    const pending = (["suspend", "reactivate", "revoke", "rotate"] as const).map(
      (action) => lifecycleConfirmCopy(action, NAME, "ACTIVE").pendingLabel,
    );
    expect(new Set(pending).size).toBe(4);
  });
});

describe("canConfirmLifecycleAction", () => {
  it("allows a non-revoke action without typing anything", () => {
    expect(canConfirmLifecycleAction({ action: "suspend", agentName: NAME, typedName: "", pending: false })).toBe(true);
    expect(canConfirmLifecycleAction({ action: "reactivate", agentName: NAME, typedName: "", pending: false })).toBe(true);
    expect(canConfirmLifecycleAction({ action: "rotate", agentName: NAME, typedName: "", pending: false })).toBe(true);
  });

  it("never allows confirmation while a request is pending", () => {
    expect(canConfirmLifecycleAction({ action: "suspend", agentName: NAME, typedName: "", pending: true })).toBe(false);
    expect(canConfirmLifecycleAction({ action: "revoke", agentName: NAME, typedName: NAME, pending: true })).toBe(false);
  });

  it("enables revoke only for the exact registered name", () => {
    const check = (typedName: string) =>
      canConfirmLifecycleAction({ action: "revoke", agentName: NAME, typedName, pending: false });
    expect(check(NAME)).toBe(true);
  });

  it("rejects wrong case, partial names, whitespace and empty input for revoke", () => {
    const check = (typedName: string) =>
      canConfirmLifecycleAction({ action: "revoke", agentName: NAME, typedName, pending: false });
    expect(check("")).toBe(false);
    expect(check("Research-Agent")).toBe(false);
    expect(check("research")).toBe(false);
    expect(check(` ${NAME}`)).toBe(false);
    expect(check(`${NAME} `)).toBe(false);
  });

  it("rejects revoke when the agent has no name", () => {
    expect(canConfirmLifecycleAction({ action: "revoke", agentName: "", typedName: "", pending: false })).toBe(false);
  });
});
