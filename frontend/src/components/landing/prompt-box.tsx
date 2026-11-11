"use client";

import { useEffect, useState } from "react";
import { DECISION_MARKS } from "@/components/checkpoint/decision-mark";
import { PROMPT_EXAMPLES } from "@/lib/landing/content";
import { INITIAL_TYPING_STATE, typingStep, typingView } from "@/lib/landing/typing";
import { cn } from "@/lib/utils";
import { ACCENT_GRADIENT } from "./landing-primitives";

/**
 * Prompt box that types real agent requests and shows AgentShield's verdict for each. The animated box is
 * aria-hidden; a visually hidden list gives every request and verdict at once. With reduced motion, the full
 * list is shown instead of the animation.
 */
export function PromptBox({ reducedMotion }: { reducedMotion: boolean }) {
  const [state, setState] = useState(INITIAL_TYPING_STATE);

  useEffect(() => {
    if (reducedMotion) return;
    let timer = 0;
    let current = INITIAL_TYPING_STATE;
    const run = (delay: number) => {
      timer = window.setTimeout(() => {
        const next = typingStep(current, PROMPT_EXAMPLES);
        current = next.state;
        setState(next.state);
        run(next.delayMs);
      }, delay);
    };
    run(700);
    return () => window.clearTimeout(timer);
  }, [reducedMotion]);

  const view = typingView(state, PROMPT_EXAMPLES);
  const example = PROMPT_EXAMPLES[state.index];

  return (
    <div className="relative overflow-hidden rounded-xl border border-border bg-card/85 shadow-sm backdrop-blur-sm">
      <span aria-hidden="true" className="absolute inset-x-0 top-0 h-px" style={{ backgroundImage: ACCENT_GRADIENT }} />
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-2">
        <span className="shrink-0 font-mono text-[0.6875rem] tracking-[0.12em] text-muted-foreground uppercase">Agent request</span>
        <span className="truncate font-mono text-[0.6875rem] text-muted-foreground max-sm:hidden">POST /api/v1/gateway/evaluate</span>
      </div>

      {reducedMotion ? (
        <ul className="flex flex-col gap-3 px-4 py-3 font-mono text-sm">
          {PROMPT_EXAMPLES.map((item) => (
            <li key={item.request} className="flex flex-col gap-1">
              <span>
                <span className="text-muted-foreground">&gt; </span>
                {item.request}
              </span>
              <Verdict decision={item.decision} text={item.verdict} />
            </li>
          ))}
        </ul>
      ) : (
        <>
          <div aria-hidden="true" className="flex flex-col gap-2 px-4 py-4 font-mono text-sm">
            <p className="min-h-[1.5em] break-all">
              <span className="text-muted-foreground">&gt; </span>
              {view.text}
              <span className="ml-0.5 inline-block h-[1.1em] w-[0.55ch] translate-y-[0.2em] bg-primary" />
            </p>
            <div className="min-h-[1.5em]">
              {view.verdict && example ? <Verdict decision={example.decision} text={view.verdict} /> : null}
            </div>
          </div>
          <ul className="sr-only">
            {PROMPT_EXAMPLES.map((item) => (
              <li key={item.request}>
                {item.request}: {item.verdict}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function Verdict({ decision, text }: { decision: keyof typeof DECISION_MARKS; text: string }) {
  const { icon: Icon, tone } = DECISION_MARKS[decision];
  return (
    <span className={cn("flex items-start gap-2 text-[0.8125rem]", tone)}>
      <Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      <span>{text}</span>
    </span>
  );
}
