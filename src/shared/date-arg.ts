/**
 * Parses a `YYYY-MM-DD` CLI argument into a UTC-midnight Date. Rejects both
 * malformed strings and calendar-invalid dates (e.g. `2026-02-30`, which the
 * `Date` constructor would otherwise silently roll forward to March 2).
 *
 * Unicode dashes and fullwidth digits (common when a date is typed through a
 * Japanese IME — e.g. `2026−01−01` with U+2212) are normalized to ASCII first,
 * so a slightly mangled input still parses instead of failing deep in a CI run.
 */
export function parseDateArg(flag: string, value: string | undefined): Date {
  const normalized = normalizeDateInput(value);
  if (!normalized || !/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    throw new Error(`${flag} expects YYYY-MM-DD, got ${JSON.stringify(value)}`);
  }
  const parsed = new Date(`${normalized}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== normalized) {
    throw new Error(`${flag} is not a valid calendar date: ${JSON.stringify(value)}`);
  }
  return parsed;
}

/** Map unicode dashes (U+2010–U+2015, U+2212, U+FF0D) to '-' and fullwidth
 *  digits (U+FF10–U+FF19) to ASCII. Returns undefined for nullish input. */
function normalizeDateInput(value: string | undefined): string | undefined {
  return value
    ?.replace(/[‐-―−－]/g, "-")
    .replace(/[０-９]/g, (d) => String.fromCharCode(d.charCodeAt(0) - 0xfee0));
}
