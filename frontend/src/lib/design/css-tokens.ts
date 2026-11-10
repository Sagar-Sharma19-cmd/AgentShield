/**
 * Reads custom-property tokens out of the text of globals.css, so tests can check the real values
 * instead of a copy. Only handles the flat top-level blocks the file uses (`:root { ... }`, `.dark { ... }`).
 */

/** Returns the body of a top-level block such as `:root { ... }` or `.dark { ... }`. */
export function cssBlockBody(css: string, selector: string): string {
  const start = css.indexOf(`\n${selector} {`);
  if (start === -1) throw new Error(`Selector ${selector} not found`);
  const open = css.indexOf("{", start);
  const close = css.indexOf("\n}", open);
  return css.slice(open + 1, close);
}

/** All `--name: value;` declarations in a block, keyed by name without the leading dashes. */
export function readCssTokens(css: string, selector: string): Map<string, string> {
  const tokens = new Map<string, string>();
  for (const match of cssBlockBody(css, selector).matchAll(/--([a-z0-9-]+):\s*([^;]+);/g)) {
    tokens.set(match[1], match[2].trim());
  }
  return tokens;
}
