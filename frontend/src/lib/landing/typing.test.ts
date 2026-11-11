import { describe, expect, it } from "vitest";
import { INITIAL_TYPING_STATE, typingStep, typingView, type TypingItem, type TypingState, type TypingTiming } from "./typing";

const TIMING: TypingTiming = { typeMs: 10, holdMs: 1000, deleteMs: 5, gapMs: 200 };
const ITEMS: TypingItem[] = [
  { request: "ab", verdict: "ALLOW · ok" },
  { request: "c", verdict: "DENY · no" },
];

function run(steps: number, start: TypingState = INITIAL_TYPING_STATE) {
  const trace: { state: TypingState; delayMs: number }[] = [];
  let state = start;
  for (let i = 0; i < steps; i += 1) {
    const next = typingStep(state, ITEMS, TIMING);
    trace.push(next);
    state = next.state;
  }
  return trace;
}

describe("typingStep", () => {
  it("types, holds, deletes, then moves to the next item", () => {
    const trace = run(7);
    expect(trace.map(({ state }) => `${state.index}:${state.phase}:${state.chars}`)).toEqual([
      "0:typing:1",
      "0:typing:2",
      "0:hold:2",
      "0:deleting:2",
      "0:deleting:1",
      "0:deleting:0",
      "1:typing:0",
    ]);
    expect(trace.map(({ delayMs }) => delayMs)).toEqual([10, 10, 1000, 5, 5, 5, 200]);
  });

  it("wraps from the last item back to the first", () => {
    const trace = run(5, { index: 1, chars: 0, phase: "typing" });
    expect(trace.at(-1)?.state).toEqual({ index: 0, chars: 0, phase: "typing" });
  });

  it("normalises an out-of-range index and survives an empty list", () => {
    expect(typingStep({ index: 5, chars: 0, phase: "typing" }, ITEMS, TIMING).state.index).toBe(1);
    expect(typingStep({ index: 0, chars: 3, phase: "hold" }, [], TIMING)).toEqual({ state: INITIAL_TYPING_STATE, delayMs: 1000 });
  });
});

describe("typingView", () => {
  it("shows the typed prefix and the verdict only while holding", () => {
    expect(typingView({ index: 0, chars: 1, phase: "typing" }, ITEMS)).toEqual({ text: "a", verdict: null });
    expect(typingView({ index: 0, chars: 2, phase: "hold" }, ITEMS)).toEqual({ text: "ab", verdict: "ALLOW · ok" });
    expect(typingView({ index: 0, chars: 2, phase: "deleting" }, ITEMS)).toEqual({ text: "ab", verdict: null });
    expect(typingView({ index: 9, chars: 2, phase: "hold" }, ITEMS)).toEqual({ text: "", verdict: null });
  });
});
