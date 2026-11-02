import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { contrastRatio, oklchRelativeLuminance, parseOklch } from "./contrast";

const CSS_PATH = fileURLToPath(new URL("../../app/globals.css", import.meta.url));
const css = readFileSync(CSS_PATH, "utf8");

/** Returns the body of a top-level block such as `:root { ... }` or `.dark { ... }`. */
function blockBody(selector: string): string {
  const start = css.indexOf(`\n${selector} {`);
  if (start === -1) throw new Error(`Selector ${selector} not found in globals.css`);
  const open = css.indexOf("{", start);
  const close = css.indexOf("\n}", open);
  return css.slice(open + 1, close);
}

function readTokens(selector: string): Map<string, string> {
  const tokens = new Map<string, string>();
  for (const match of blockBody(selector).matchAll(/--([a-z0-9-]+):\s*([^;]+);/g)) {
    tokens.set(match[1], match[2].trim());
  }
  return tokens;
}

/** Text/background pairs the components rely on. Each must reach WCAG AA for normal text (4.5:1). */
const PAIRS: [text: string, background: string][] = [
  ["foreground", "background"],
  ["card-foreground", "card"],
  ["popover-foreground", "popover"],
  ["primary-foreground", "primary"],
  ["secondary-foreground", "secondary"],
  ["muted-foreground", "background"],
  ["muted-foreground", "muted"],
  ["accent-foreground", "accent"],
  ["destructive-foreground", "destructive"],
  ["success-foreground", "success"],
  ["warning-foreground", "warning"],
  ["danger-foreground", "danger"],
  ["success-text", "background"],
  ["warning-text", "background"],
  ["danger-text", "background"],
  ["danger-text", "card"],
  ["primary", "background"],
  ["sidebar-foreground", "sidebar"],
  ["sidebar-accent-foreground", "sidebar-accent"],
  ["sidebar-primary-foreground", "sidebar-primary"],
];

const THEMES = { light: ":root", dark: ".dark" } as const;

describe("theme contrast (globals.css tokens)", () => {
  for (const [themeName, selector] of Object.entries(THEMES)) {
    const tokens = readTokens(selector);

    it(`${themeName} theme defines every pair token`, () => {
      for (const [text, background] of PAIRS) {
        expect(tokens.has(text), `${themeName}: --${text}`).toBe(true);
        expect(tokens.has(background), `${themeName}: --${background}`).toBe(true);
      }
    });

    for (const [text, background] of PAIRS) {
      it(`${themeName}: --${text} on --${background} reaches 4.5:1`, () => {
        const textColour = parseOklch(tokens.get(text) ?? "");
        const backgroundColour = parseOklch(tokens.get(background) ?? "");
        expect(textColour, `--${text} must be an opaque oklch() value`).not.toBeNull();
        expect(backgroundColour, `--${background} must be an opaque oklch() value`).not.toBeNull();

        const ratio = contrastRatio(
          oklchRelativeLuminance(textColour!),
          oklchRelativeLuminance(backgroundColour!),
        );
        expect(ratio).toBeGreaterThanOrEqual(4.5);
      });
    }
  }
});
