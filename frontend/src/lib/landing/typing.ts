/**
 * Auto-typing prompt box: a small state machine. Pure; tested in typing.test.ts.
 *
 * For each item: type the request one character at a time, hold with the verdict shown, delete it, then
 * move to the next item (wrapping). `typingStep` returns the next state and how long to wait before
 * calling it again, so the component only owns a timer.
 */

export interface TypingItem {
  request: string;
  verdict: string;
}

export type TypingPhase = "typing" | "hold" | "deleting";

export interface TypingState {
  index: number;
  /** Characters of the current request that are visible. */
  chars: number;
  phase: TypingPhase;
}

export interface TypingTiming {
  /** Per typed character. */
  typeMs: number;
  /** How long a full request and its verdict stay on screen. */
  holdMs: number;
  /** Per deleted character. */
  deleteMs: number;
  /** Pause between deleting one request and typing the next. */
  gapMs: number;
}

export const TYPING_TIMING: TypingTiming = { typeMs: 45, holdMs: 2400, deleteMs: 16, gapMs: 450 };

export const INITIAL_TYPING_STATE: TypingState = { index: 0, chars: 0, phase: "typing" };

export function typingStep(
  state: TypingState,
  items: readonly TypingItem[],
  timing: TypingTiming = TYPING_TIMING,
): { state: TypingState; delayMs: number } {
  if (items.length === 0) return { state: INITIAL_TYPING_STATE, delayMs: timing.holdMs };
  const index = ((state.index % items.length) + items.length) % items.length;
  const length = items[index].request.length;

  switch (state.phase) {
    case "typing":
      if (state.chars < length) return { state: { index, chars: state.chars + 1, phase: "typing" }, delayMs: timing.typeMs };
      return { state: { index, chars: length, phase: "hold" }, delayMs: timing.holdMs };
    case "hold":
      return { state: { index, chars: length, phase: "deleting" }, delayMs: timing.deleteMs };
    case "deleting":
      if (state.chars > 0) return { state: { index, chars: state.chars - 1, phase: "deleting" }, delayMs: timing.deleteMs };
      return { state: { index: (index + 1) % items.length, chars: 0, phase: "typing" }, delayMs: timing.gapMs };
  }
}

/** What the prompt box shows for a state. The verdict is visible only while holding a complete request. */
export function typingView(state: TypingState, items: readonly TypingItem[]): { text: string; verdict: string | null } {
  const item = items[state.index];
  if (!item) return { text: "", verdict: null };
  return {
    text: item.request.slice(0, Math.max(0, state.chars)),
    verdict: state.phase === "hold" ? item.verdict : null,
  };
}
