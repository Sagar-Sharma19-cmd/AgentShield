import { Fragment } from "react";
import { breakableParts } from "@/lib/text";

/**
 * A long identifier that wraps only after "/", "-" or an inner "." (lib/text.ts), never mid-word. A single part
 * wider than its box still wraps (overflow-wrap:anywhere) rather than overflow, as a last resort.
 */
export function BreakableText({ text }: { text: string }) {
  return (
    <span className="break-normal [overflow-wrap:anywhere]">
      {breakableParts(text).map((part, index) => (
        <Fragment key={index}>
          {index > 0 && <wbr />}
          {part}
        </Fragment>
      ))}
    </span>
  );
}
