/**
 * WCAG 2.x contrast for OKLCH colours. Used by the theme contrast test to check the tokens in
 * src/app/globals.css, so the accessibility claim is measured rather than assumed.
 */

/** Parses `oklch(L C H)` with L as a number or percentage. Alpha is not supported (returns null). */
export function parseOklch(value: string): { l: number; c: number; h: number } | null {
  const match = /^oklch\(\s*([\d.]+%?)\s+([\d.]+)\s+([\d.]+)\s*\)$/.exec(value.trim());
  if (!match) return null;
  const rawL = match[1];
  const l = rawL.endsWith("%") ? Number.parseFloat(rawL) / 100 : Number.parseFloat(rawL);
  return { l, c: Number.parseFloat(match[2]), h: Number.parseFloat(match[3]) };
}

/** Relative luminance of an OKLCH colour, via linear sRGB (Björn Ottosson's OKLab transform). */
export function oklchRelativeLuminance({ l, c, h }: { l: number; c: number; h: number }): number {
  const hr = (h * Math.PI) / 180;
  const a = c * Math.cos(hr);
  const b = c * Math.sin(hr);

  const lp = l + 0.3963377774 * a + 0.2158037573 * b;
  const mp = l - 0.1055613458 * a - 0.0638541728 * b;
  const sp = l - 0.0894841775 * a - 1.291485548 * b;

  const L = lp ** 3;
  const M = mp ** 3;
  const S = sp ** 3;

  const r = 4.0767416621 * L - 3.3077115913 * M + 0.2309699292 * S;
  const g = -1.2684380046 * L + 2.6097574011 * M - 0.3413193965 * S;
  const bl = -0.0041960863 * L - 0.7034186147 * M + 1.707614701 * S;

  const clamp = (x: number) => Math.min(1, Math.max(0, x));
  return 0.2126 * clamp(r) + 0.7152 * clamp(g) + 0.0722 * clamp(bl);
}

/** WCAG contrast ratio between two relative luminances (order does not matter). */
export function contrastRatio(lumA: number, lumB: number): number {
  const [hi, lo] = lumA > lumB ? [lumA, lumB] : [lumB, lumA];
  return (hi + 0.05) / (lo + 0.05);
}
