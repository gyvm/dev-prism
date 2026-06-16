import { access } from "node:fs/promises";
import { join, resolve } from "node:path";

import { DuckDBConnection } from "@duckdb/node-api";

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
 * Reads `max(pull_requests.updated_at)` per `repo_key` from a committed DWH.
 * The cursor is derived from the data itself (self-healing), so no separate
 * state file is needed. Returns an empty map when the DWH does not yet exist
 * (first full load).
 */
export async function readRepoWatermarks(dwhDir: string): Promise<RepoWatermarks> {
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
      `SELECT r.repo_key AS repo_key, CAST(max(p.updated_at) AS VARCHAR) AS updated_text
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
