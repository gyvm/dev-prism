import type { ReactElement } from "react";

import { queryPrTimeline } from "../../analyses/pr-timeline/query.js";
import type { Scope } from "../../analyses/scope.js";
import type { DwhQueryRunner } from "../../warehouse/runner.js";
import GanttChart from "./GanttChart.js";

// Timeline: one row per PR, segmented by state.
export async function renderTimelineView(
  runner: DwhQueryRunner,
  scope: Scope,
): Promise<ReactElement> {
  const timeline = await queryPrTimeline(runner, scope);
  return <GanttChart {...timeline} />;
}
