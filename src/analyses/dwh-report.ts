import type { RendererId } from "../pipeline/types.js";
import { renderAnalysis } from "../renderers/index.js";
import type { DwhQueryRunner } from "../warehouse/query.js";
import { queryDora } from "./dora-metrics/query.js";
import { queryPrTimeline } from "./pr-timeline/query.js";
import { queryReviewCorrelation } from "./review-correlation/query.js";
import type { Scope } from "./scope.js";

// Closes the contract loop (design D1): scope → SQL query → view-model →
// existing renderer → HTML. The renderers are unchanged; they receive the same
// view-models the in-memory compute produced, now sourced from the DWH.

export type DwhAnalysisId = "dora-metrics" | "review-correlation" | "pr-timeline";

type DwhAnalysisEntry = Readonly<{
  query: (runner: DwhQueryRunner, scope: Scope) => Promise<unknown>;
  renderer: RendererId;
}>;

export const DWH_ANALYSIS_REGISTRY: Readonly<Record<DwhAnalysisId, DwhAnalysisEntry>> = {
  "dora-metrics": { query: queryDora, renderer: "metric-cards" },
  "review-correlation": { query: queryReviewCorrelation, renderer: "bipartite-graph" },
  "pr-timeline": { query: queryPrTimeline, renderer: "gantt-chart" },
};

/** Runs an analysis against the DWH for `scope` and returns its view-model. */
export async function queryDwhAnalysis(
  runner: DwhQueryRunner,
  id: DwhAnalysisId,
  scope: Scope,
): Promise<unknown> {
  return DWH_ANALYSIS_REGISTRY[id].query(runner, scope);
}

/** Runs an analysis and renders it to HTML through the existing renderer. */
export async function renderDwhAnalysis(
  runner: DwhQueryRunner,
  id: DwhAnalysisId,
  scope: Scope,
): Promise<string> {
  const entry = DWH_ANALYSIS_REGISTRY[id];
  const data = await entry.query(runner, scope);
  return renderAnalysis(entry.renderer, data);
}
