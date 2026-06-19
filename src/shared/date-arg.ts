/**
 * Parses a `YYYY-MM-DD` CLI argument into a UTC-midnight Date. Rejects both
 * malformed strings and calendar-invalid dates (e.g. `2026-02-30`, which the
 * `Date` constructor would otherwise silently roll forward to March 2).
 */
export function parseDateArg(flag: string, value: string | undefined): Date {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`${flag} expects YYYY-MM-DD, got ${JSON.stringify(value)}`);
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new Error(`${flag} is not a valid calendar date: ${JSON.stringify(value)}`);
  }
  return parsed;
}
