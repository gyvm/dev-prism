import type { DwhColumnType } from "./schema.js";

export type DwhScalar = string | number | boolean | null;

export type DwhRow = Readonly<Record<string, DwhScalar>>;

export type DwhTableRows = Readonly<Record<string, readonly DwhRow[]>>;

// Coerces a naive (timezone-less) timestamp string to an explicit UTC ISO
// string. All DWH timestamps are UTC, so a string without a tz designator must
// be read as UTC — never as the host's local time. This makes isoToSqlTimestamp
// idempotent: re-applying it to its own naive output does not shift the value.
function toUtcIso(value: string): string {
  const trimmed = value.trim();
  if (/[zZ]$/.test(trimmed) || /[+-]\d{2}:?\d{2}$/.test(trimmed)) {
    return trimmed;
  }
  const withT = trimmed.includes(" ") ? trimmed.replace(" ", "T") : trimmed;
  return /T\d{2}:\d{2}/.test(withT) ? `${withT}Z` : withT;
}

export function isoToSqlTimestamp(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const date = new Date(toUtcIso(value));
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().replace("T", " ").replace("Z", "");
}

export function valueForColumnType(value: DwhScalar, type: DwhColumnType): DwhScalar {
  if (value === null) return null;
  if (type === "TIMESTAMP") {
    return isoToSqlTimestamp(String(value));
  }
  if (type === "JSON") {
    return typeof value === "string" ? value : JSON.stringify(value);
  }
  return value;
}
