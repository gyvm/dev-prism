import { access } from "node:fs/promises";
import { join, resolve } from "node:path";

import { DuckDBConnection } from "@duckdb/node-api";

import type { CollectionWindow } from "../shared/types.js";

// Default slack subtracted from each repo watermark. Absorbs the boundary and
// GitHub search-index lag; idempotent re-fetch makes the overlap harmless.
export const DEFAULT_OVERLAP_MINUTES = 120;

export type RepoWatermarks = ReadonlyMap<string, Date>;

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function sqlString(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

/**
 * Reads `<agg>(pull_requests.updated_at)` per `repo_key` from a committed DWH,
 * where `agg` is `max` (leading edge / incremental cursor) or `min` (trailing
 * edge / how far back history has been backfilled). The bound is derived from
 * the data itself (self-healing), so no separate state file is needed. Returns
 * an empty map when the DWH does not yet exist (first full load).
 */
async function readRepoAggregate(dwhDir: string, agg: "min" | "max"): Promise<RepoWatermarks> {
  const root = resolve(dwhDir);
  const pullRequestsPath = join(root, "pull_requests.parquet");
  const reposPath = join(root, "repos.parquet");

  if (!(await exists(pullRequestsPath)) || !(await exists(reposPath))) {
    return new Map();
  }

  const connection = await DuckDBConnection.create();
  try {
    // Stored timestamps are timezone-naive UTC wall-clock. Read them back as
    // text and parse as UTC to avoid the session timezone shifting them.
    const reader = await connection.runAndReadAll(
      `SELECT r.repo_key AS repo_key, CAST(${agg}(p.updated_at) AS VARCHAR) AS updated_text
       FROM read_parquet(${sqlString(pullRequestsPath)}) p
       JOIN read_parquet(${sqlString(reposPath)}) r USING (repo_id)
       WHERE p.updated_at IS NOT NULL
       GROUP BY r.repo_key`,
    );
    const watermarks = new Map<string, Date>();
    for (const row of reader.getRowObjects() as Array<{ repo_key: unknown; updated_text: unknown }>) {
      if (typeof row.repo_key !== "string" || typeof row.updated_text !== "string") continue;
      const parsed = new Date(`${row.updated_text.replace(" ", "T")}Z`);
      if (!Number.isNaN(parsed.getTime())) {
        watermarks.set(row.repo_key, parsed);
      }
    }
    return watermarks;
  } finally {
    connection.closeSync();
  }
}

/**
 * `max(updated_at)` per repo: the incremental (leading-edge) cursor.
 */
export function readRepoWatermarks(dwhDir: string): Promise<RepoWatermarks> {
  return readRepoAggregate(dwhDir, "max");
}

/**
 * `min(updated_at)` per repo: the trailing edge, i.e. how far back history has
 * already been collected. Used to fetch only the uncovered older slice during
 * backfill so already-covered history is not re-fetched.
 */
export function readRepoLowWatermarks(dwhDir: string): Promise<RepoWatermarks> {
  return readRepoAggregate(dwhDir, "min");
}

/**
 * Resolves the incremental-collection cursor for a repo: its watermark minus
 * `overlap`, or the static fallback (cutoffDate) when the repo has no rows yet.
 */
export function resolveSince(
  repoKey: string,
  watermarks: RepoWatermarks,
  fallback: Date,
  overlapMinutes: number = DEFAULT_OVERLAP_MINUTES,
): Date {
  const watermark = watermarks.get(repoKey);
  if (!watermark) return fallback;
  return new Date(watermark.getTime() - overlapMinutes * 60_000);
}

export type ResolveWindowParams = Readonly<{
  highWatermarks: RepoWatermarks;
  lowWatermarks: RepoWatermarks;
  fallbackCutoff: Date;
  /** CLI `--from`. Its presence selects backfill intent. */
  from?: Date;
  overlapMinutes?: number;
}>;

/**
 * Resolves the per-repo collection window. Two intents, selected by `from`:
 *
 *  - Incremental (no `from`): forward fill. `since = high − overlap` (or the
 *    static cutoff on first load), `until` open. The overlap is applied only
 *    here because it compensates GitHub search-index lag on the *leading* edge;
 *    a backfill floor is user-pinned and needs no slack.
 *  - Backfill (`from` given): backward fill the *uncovered* older slice only.
 *    Coverage is the contiguous interval [low, now], so we fetch `[from, low]`
 *    and skip (return `null`) when `from` is not older than `low`.
 *
 * Effective granularity is one day: `buildSearchQuery` rounds both bounds to
 * YYYY-MM-DD, so the `until = low` boundary re-fetches `low`'s day (the
 * idempotent upsert absorbs it). "No redundant fetch" therefore holds to ±1
 * day, not to the second — keeping the backfilled range connected to existing
 * coverage with no gap.
 */
export function resolveCollectionWindow(
  repoKey: string,
  params: ResolveWindowParams,
): CollectionWindow | null {
  const overlap = params.overlapMinutes ?? DEFAULT_OVERLAP_MINUTES;

  if (!params.from) {
    return {
      since: resolveSince(repoKey, params.highWatermarks, params.fallbackCutoff, overlap),
    };
  }

  const low = params.lowWatermarks.get(repoKey);
  if (!low) {
    // Repo has no rows yet: fetch everything from the requested floor forward.
    return { since: params.from };
  }
  if (params.from.getTime() >= low.getTime()) {
    // Requested floor is already within covered history → nothing older to do.
    return null;
  }
  return { since: params.from, until: low };
}
