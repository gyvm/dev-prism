import type { DwhQueryRunner } from "../warehouse/runner.js";
import { resolveScope, type Scope } from "../analyses/scope.js";
import { scopeFromSearchParams } from "../analyses/scope-url.js";

const DAY_MS = 86_400_000;
const DEFAULT_WINDOW_DAYS = 365;

/**
 * Reads scope from the URL and fills a default window. `now` is injectable for
 * tests.
 */
export function scopeFromUrl(search: string, now: Date): Scope {
  const parsed = scopeFromSearchParams(new URLSearchParams(search));
  const to = parsed.to ?? now;
  const from = parsed.from ?? new Date(to.getTime() - DEFAULT_WINDOW_DAYS * DAY_MS);
  return resolveScope({ ...parsed, from, to });
}

/**
 * Distinct repo keys and actor logins from the DWH, for the filter multiselects.
 * Returns empty arrays when the relevant tables are absent/empty (the WASM
 * runner exposes missing parquet as empty tables), so the UI shows no options
 * rather than erroring.
 */
export async function queryFilterOptions(
  runner: DwhQueryRunner,
): Promise<{ repos: string[]; users: string[] }> {
  const [repos, users] = await Promise.all([
    runner.all<{ repo_key: string }>(
      "SELECT DISTINCT repo_key FROM repos WHERE repo_key IS NOT NULL ORDER BY repo_key",
    ),
    runner.all<{ login: string }>(
      "SELECT DISTINCT login FROM actors WHERE login IS NOT NULL ORDER BY login",
    ),
  ]);
  return { repos: repos.map((row) => row.repo_key), users: users.map((row) => row.login) };
}
