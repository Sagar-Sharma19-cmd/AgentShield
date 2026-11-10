/**
 * Pure helpers behind <AnimatedNumber>. Kept separate from the component so they can be unit-tested
 * without a DOM and reused by non-animated displays that must match its output.
 */

export interface NumberFormatSpec {
  /** Fixed number of fraction digits. Defaults to 0. */
  decimals?: number;
  /** BCP 47 locale. Defaults to "en-US" so server and client render identical strings. */
  locale?: string;
}

const formatterCache = new Map<string, Intl.NumberFormat>();

function formatterFor(decimals: number, locale: string): Intl.NumberFormat {
  const key = `${locale}|${decimals}`;
  let formatter = formatterCache.get(key);
  if (!formatter) {
    formatter = new Intl.NumberFormat(locale, {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
    formatterCache.set(key, formatter);
  }
  return formatter;
}

/** Clamps a requested fraction-digit count to Intl's supported range (0–20) and to an integer. */
export function normalizeDecimals(decimals: number | undefined): number {
  if (decimals === undefined || !Number.isFinite(decimals)) return 0;
  return Math.min(20, Math.max(0, Math.trunc(decimals)));
}

/**
 * Formats a (possibly mid-animation) value with grouping and a fixed number of decimals.
 * Non-finite input renders as an en dash, matching the console's "no value" convention.
 * Negative zero produced by rounding renders as "0".
 */
export function formatAnimatedNumber(value: number, spec: NumberFormatSpec = {}): string {
  if (!Number.isFinite(value)) return "–";
  const decimals = normalizeDecimals(spec.decimals);
  const factor = 10 ** decimals;
  const rounded = Math.round(value * factor) / factor;
  return formatterFor(decimals, spec.locale ?? "en-US").format(Object.is(rounded, -0) ? 0 : rounded + 0);
}

/**
 * Whether a change from `from` to `to` should animate. It should not when the user prefers reduced
 * motion, when nothing changes, or when either end is not a finite number.
 */
export function shouldAnimateNumber(from: number, to: number, prefersReducedMotion: boolean): boolean {
  if (prefersReducedMotion) return false;
  if (!Number.isFinite(from) || !Number.isFinite(to)) return false;
  return from !== to;
}
