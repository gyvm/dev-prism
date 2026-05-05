import type { RendererId } from "../pipeline/types.js";
import type { AnalysisContext } from "./context.js";

import { compute as computeDora } from "./dora-metrics/compute.js";
import { compute as computeTimeline } from "./pr-timeline/compute.js";
import { compute as computeReviewCorrelation } from "./review-correlation/compute.js";

export type ComputeEntry = Readonly<{
  compute: (ctx: AnalysisContext) => unknown;
  renderer: RendererId;
}>;

export const COMPUTE_REGISTRY: Readonly<Record<string, ComputeEntry>> = {
  "dora-metrics": { compute: computeDora, renderer: "metric-cards" },
  "pr-timeline": { compute: computeTimeline, renderer: "gantt-chart" },
  "review-correlation": {
    compute: computeReviewCorrelation,
    renderer: "bipartite-graph",
  },
};
