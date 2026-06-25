import type { Scope } from "./scope.js";
import { scopeTimestamp } from "./scope.js";

// Scope values are application-controlled (Dates, repo keys, logins), so SQL
// fragments are built by escaping literals rather than threading named params
// through every composed CTE.

function sqlString(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

/** ` AND col IN ('a','b')`, or "" when the list is empty. */
export function inListFilter(column: string, values: readonly string[]): string {
  if (values.length === 0) return "";
  const literals = values.map(sqlString).join(", ");
  return ` AND ${column} IN (${literals})`;
}

/**
 * ` AND (colA IN (...) OR colB IN (...))` — a row matches when either column is
 * in the list. Used for analyses where `scope.users` spans two axes
 * (review-correlation: author OR reviewer).
 */
export function eitherInListFilter(
  columnA: string,
  columnB: string,
  values: readonly string[],
): string {
  if (values.length === 0) return "";
  const literals = values.map(sqlString).join(", ");
  return ` AND (${columnA} IN (${literals}) OR ${columnB} IN (${literals}))`;
}

/** ` AND col >= TIMESTAMP '…' AND col <= TIMESTAMP '…'` for the bounds that are set. */
export function timeRangeFilter(column: string, scope: Scope): string {
  const parts: string[] = [];
  if (scope.from) parts.push(` AND ${column} >= TIMESTAMP ${sqlString(scopeTimestamp(scope.from))}`);
  if (scope.to) parts.push(` AND ${column} <= TIMESTAMP ${sqlString(scopeTimestamp(scope.to))}`);
  return parts.join("");
}

/** ` AND NOT col` when bots are excluded, else "". `column` is an is_bot flag. */
export function botFilter(isBotColumn: string, scope: Scope): string {
  return scope.includeBots ? "" : ` AND NOT ${isBotColumn}`;
}
