import type { DwhQueryRunner } from "../warehouse/runner.js";
import { resolveScope, type Scope } from "../analyses/scope.js";
import { scopeFromSearchParams } from "../analyses/scope-url.js";
import { queryDora } from "../analyses/dora-metrics/query.js";
import { queryReviewCorrelation } from "../analyses/review-correlation/query.js";
import { queryPrTimeline } from "../analyses/pr-timeline/query.js";
import { renderBipartiteGraph, renderGanttChart, renderMetricCards } from "../renderers/index.js";

const DAY_MS = 86_400_000;
const DEFAULT_WINDOW_DAYS = 365;

/**
 * Reads scope from the URL and fills a default window (a report needs concrete
 * from/to — pr-timeline requires `to`). `now` is injectable for tests.
 */
export function scopeFromUrl(search: string, now: Date): Scope {
  const parsed = scopeFromSearchParams(new URLSearchParams(search));
  const to = parsed.to ?? now;
  const from = parsed.from ?? new Date(to.getTime() - DEFAULT_WINDOW_DAYS * DAY_MS);
  return resolveScope({ ...parsed, from, to });
}

/**
 * Runs the same analyses the frozen report uses (DORA / review-correlation /
 * PR timeline) against the DWH via the WASM runner and returns the combined
 * HTML using the existing renderers — identical SQL, view-models and renderers
 * as Reports. Each renderer already emits its own <section><h2>, so outputs are
 * joined directly. Pure (no DOM) so the caller can guard against stale writes
 * and re-activate the renderers' inline scripts.
 */
export async function buildExploreHtml(runner: DwhQueryRunner, scope: Scope): Promise<string> {
  const [dora, correlation, timeline] = await Promise.all([
    queryDora(runner, scope),
    queryReviewCorrelation(runner, scope),
    queryPrTimeline(runner, scope),
  ]);

  return [
    renderMetricCards(dora),
    renderBipartiteGraph(correlation),
    renderGanttChart(timeline),
  ].join("\n");
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
