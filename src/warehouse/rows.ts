import type { DwhColumnType } from "./schema.js";

export type DwhScalar = string | number | boolean | null;

export type DwhRow = Readonly<Record<string, DwhScalar>>;

export type DwhTableRows = Readonly<Record<string, readonly DwhRow[]>>;

export function isoToSqlTimestamp(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const date = new Date(value);
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
