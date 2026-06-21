import type { RendererId } from "../pipeline/types.js";
import { renderBipartiteGraph } from "./bipartite-graph.js";
import { renderDevPrismSummary } from "./dev-prism-summary.js";
import { renderGanttChart } from "./gantt-chart.js";
import { renderMetricCards } from "./metric-cards.js";

export type Renderer = (data: unknown) => string;

export const Renderers: Record<RendererId, Renderer> = {
  "dev-prism-summary": renderDevPrismSummary,
  "metric-cards": renderMetricCards,
  "gantt-chart": renderGanttChart,
  "bipartite-graph": renderBipartiteGraph,
};

export function renderAnalysis(rendererId: RendererId, data: unknown): string {
  const fn = Renderers[rendererId];
  if (!fn) {
    throw new Error(`Unknown renderer: ${rendererId}`);
  }
  return fn(data);
}

export { renderBipartiteGraph, renderDevPrismSummary, renderGanttChart, renderMetricCards };
