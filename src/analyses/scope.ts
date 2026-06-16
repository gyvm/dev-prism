import { isoToSqlTimestamp } from "../warehouse/rows.js";

export type Grain = "day" | "week" | "month";

/**
 * Canonical query scope shared by Reports (frozen, fixed values) and Explore
 * (live values). The same shape is fed to every analysis `query.ts`.
 *
 * - `from` / `to`: inclusive bounds (UTC). `null` means unbounded on that side.
 * - `repos`: repo keys (`owner/name`). Empty = all repositories.
 * - `users`: actor logins interpreted against each table's natural actor
 *   (authors for `pull_requests`, actor for `activities`). Empty = everyone.
 * - `includeBots`: when false, rows whose actor is a bot are excluded.
 * - `grain`: bucket size for trend queries (`date_trunc`).
 * - `thresholds`: query-time knobs (e.g. `firstReviewThresholdHours`).
 */
export type Scope = Readonly<{
  from: Date | null;
  to: Date | null;
  repos: readonly string[];
  users: readonly string[];
  includeBots: boolean;
  grain: Grain;
  thresholds: Readonly<Record<string, number>>;
}>;

export type ScopeInput = Partial<{
  from: Date | string | null;
  to: Date | string | null;
  repos: readonly string[];
  users: readonly string[];
  includeBots: boolean;
  grain: Grain;
  thresholds: Readonly<Record<string, number>>;
}>;

const GRAINS: ReadonlySet<string> = new Set(["day", "week", "month"]);

function toDate(value: Date | string | null | undefined): Date | null {
  if (value == null) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid scope date: ${JSON.stringify(value)}`);
  }
  return date;
}

/** Fills a partial scope with defaults (everything, week grain, bots included). */
export function resolveScope(input: ScopeInput = {}): Scope {
  if (input.grain !== undefined && !GRAINS.has(input.grain)) {
    throw new Error(`Invalid scope grain: ${JSON.stringify(input.grain)}`);
  }
  return {
    from: toDate(input.from),
    to: toDate(input.to),
    repos: input.repos ?? [],
    users: input.users ?? [],
    includeBots: input.includeBots ?? true,
    grain: input.grain ?? "week",
    thresholds: input.thresholds ?? {},
  };
}

/** Naive-UTC string for binding a Date against a DWH TIMESTAMP column. */
export function scopeTimestamp(date: Date): string {
  const value = isoToSqlTimestamp(date.toISOString());
  if (value === null) {
    throw new Error(`Invalid scope timestamp: ${date.toISOString()}`);
  }
  return value;
}
