import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { contrastRatio, oklchRelativeLuminance, parseOklch } from "./contrast";
import { readCssTokens } from "./css-tokens";

/*
 * Pairs added with the Graphite palette (docs/frontend-design-system.md). theme-contrast.test.ts covers
 * the base shadcn pairs; this file covers status text on cards and the HIGH risk-tier tone.
 */

const css = readFileSync(fileURLToPath(new URL("../../app/globals.css", import.meta.url)), "utf8");

const PAIRS: [text: string, background: string][] = [
  ["success-text", "card"],
  ["warning-text", "card"],
  ["risk-high-text", "background"],
  ["risk-high-text", "card"],
  ["muted-foreground", "card"],
  ["muted-foreground", "sidebar"],
  ["foreground", "popover"],
];

function ratio(tokens: Map<string, string>, text: string, background: string): number {
  const a = parseOklch(tokens.get(text) ?? "");
  const b = parseOklch(tokens.get(background) ?? "");
  expect(a, `--${text} must be an opaque oklch() value`).not.toBeNull();
  expect(b, `--${background} must be an opaque oklch() value`).not.toBeNull();
  return contrastRatio(oklchRelativeLuminance(a!), oklchRelativeLuminance(b!));
}

describe("semantic token contrast (globals.css)", () => {
  for (const [themeName, selector] of Object.entries({ light: ":root", dark: ".dark" })) {
    const tokens = readCssTokens(css, selector);

    for (const [text, background] of PAIRS) {
      it(`${themeName}: --${text} on --${background} reaches 4.5:1`, () => {
        expect(ratio(tokens, text, background)).toBeGreaterThanOrEqual(4.5);
      });
    }

    it(`${themeName}: HIGH (orange) and CRITICAL (red) text tones are distinct hues`, () => {
      const high = parseOklch(tokens.get("risk-high-text") ?? "");
      const critical = parseOklch(tokens.get("danger-text") ?? "");
      expect(Math.abs(high!.h - critical!.h)).toBeGreaterThanOrEqual(20);
    });
  }
});
