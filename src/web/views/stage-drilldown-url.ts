import { CYCLE_STAGE_KEYS, type CycleStageKey } from "../../analyses/cycle-time/view-model.js";
import type { Scope } from "../../analyses/scope.js";
import { scopeToSearchParams } from "../../analyses/scope-url.js";
import { siteBase } from "../base-path.js";

// The 1-2 funnel → 3-2 table drilldown (docs/explore-screens.md「ページ間の動線」):
// clicking a funnel stage card opens the timeline tab with the stage table sorted
// by that stage, longest first.
//
// `sort`/`dir` deliberately stay out of `Scope`. Scope is the contract every
// query.ts builds SQL from, and sort has no SQL effect at all — StageTimeTable
// receives every row and sorts client-side. Making resolveScope validate a
// CycleStageKey union for one table on one view would be the wrong home. Writer
// and reader live in this one module so the parameter names cannot drift.

export type StageSortKey = CycleStageKey | "sizeLines" | "mergedAt";

export type StageSort = Readonly<{ key: StageSortKey; desc: boolean }>;

const SORT_KEYS: ReadonlySet<string> = new Set<string>([
  ...CYCLE_STAGE_KEYS,
  "sizeLines",
  "mergedAt",
]);

/** Href onto the timeline view, carrying the current scope plus the sort intent. */
export function buildStageDrilldownHref(scope: Scope, key: CycleStageKey): string {
  const params = scopeToSearchParams(scope);
  params.set("sort", key);
  params.set("dir", "desc");
  return `${siteBase()}explore/timeline/?${params.toString()}`;
}

/**
 * Reads the landing sort out of a query string. Returns undefined for a missing
 * or unrecognised key so the table falls back to its own default; an unknown
 * `dir` means descending, matching the drilldown's "longest first" intent.
 */
export function parseStageSort(search: string): StageSort | undefined {
  const params = new URLSearchParams(search);
  const key = params.get("sort");
  if (key === null || !SORT_KEYS.has(key)) return undefined;
  return { key: key as StageSortKey, desc: params.get("dir") !== "asc" };
}
