import { describe, expect, it } from "vitest";
import { keyForAgent, oneTimeKeyReducer, type OneTimeKeyState } from "./one-time-key";

const AGENT_A = "11111111-1111-4111-8111-111111111111";
const AGENT_B = "22222222-2222-4222-8222-222222222222";
const FAKE_A = "agk_live_FAKEONETIMEAAAAAAAAAAAAAAA";
const FAKE_B = "agk_live_FAKEONETIMEBBBBBBBBBBBBBBB";

describe("oneTimeKeyReducer", () => {
  it("holds an issued key for its agent", () => {
    const state = oneTimeKeyReducer(null, { type: "issued", issued: { agentId: AGENT_A, apiKey: FAKE_A } });
    expect(state).toEqual({ agentId: AGENT_A, apiKey: FAKE_A });
  });

  it("clears the key on acknowledgement", () => {
    const held: OneTimeKeyState = { agentId: AGENT_A, apiKey: FAKE_A };
    expect(oneTimeKeyReducer(held, { type: "acknowledged" })).toBeNull();
  });

  it("clears the key when the operator discards it", () => {
    const held: OneTimeKeyState = { agentId: AGENT_A, apiKey: FAKE_A };
    const after = oneTimeKeyReducer(held, { type: "discarded" });
    expect(after).toBeNull();
    expect(keyForAgent(after, AGENT_A)).toBeNull();
  });

  it("clears the actual held key when the admin session is locked, not just a flag", () => {
    const held: OneTimeKeyState = { agentId: AGENT_A, apiKey: FAKE_A };
    const after = oneTimeKeyReducer(held, { type: "session-locked" });
    expect(after).toBeNull();
    expect(keyForAgent(after, AGENT_A)).toBeNull();
  });

  it("replaces a held key with a newly issued one, never keeping both", () => {
    const first: OneTimeKeyState = { agentId: AGENT_A, apiKey: FAKE_A };
    const second = oneTimeKeyReducer(first, { type: "issued", issued: { agentId: AGENT_B, apiKey: FAKE_B } });
    expect(second).toEqual({ agentId: AGENT_B, apiKey: FAKE_B });
    expect(keyForAgent(second, AGENT_A)).toBeNull();
  });

  it("does not mutate the previous state", () => {
    const held: OneTimeKeyState = { agentId: AGENT_A, apiKey: FAKE_A };
    oneTimeKeyReducer(held, { type: "acknowledged" });
    expect(held).toEqual({ agentId: AGENT_A, apiKey: FAKE_A });
  });
});

describe("keyForAgent", () => {
  it("returns the key only for the agent it was issued to", () => {
    const state: OneTimeKeyState = { agentId: AGENT_A, apiKey: FAKE_A };
    expect(keyForAgent(state, AGENT_A)).toBe(FAKE_A);
    expect(keyForAgent(state, AGENT_B)).toBeNull();
  });

  it("returns null when nothing is held", () => {
    expect(keyForAgent(null, AGENT_A)).toBeNull();
  });
});
