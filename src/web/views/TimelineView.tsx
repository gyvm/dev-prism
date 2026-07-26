import type { ReactElement } from "react";

import { queryPrStageTimes } from "../../analyses/cycle-time/query.js";
import { queryPrTimeline } from "../../analyses/pr-timeline/query.js";
import type { Scope } from "../../analyses/scope.js";
import type { DwhQueryRunner } from "../../warehouse/runner.js";
import GanttChart from "./GanttChart.js";
import { parseStageSort } from "./stage-drilldown-url.js";
import StageTimeTable from "./StageTimeTable.js";

// Timeline: the same PRs twice — as bands to spot a shape (3-1), as numbers to
// sort by an outlier (3-2). This is where the flow funnel's drilldown lands, so
// the table reads its opening sort from the URL the funnel card built.
//
// Views only ever run inside the client-only Explore island, so reading
// `window.location.search` here is safe; `parseStageSort` itself stays pure.
export async function renderTimelineView(
  runner: DwhQueryRunner,
  scope: Scope,
): Promise<ReactElement> {
  const [timeline, stageTimes] = await Promise.all([
    queryPrTimeline(runner, scope),
    queryPrStageTimes(runner, scope),
  ]);

  return (
    <>
      <GanttChart {...timeline} />
      <StageTimeTable rows={stageTimes} initialSort={parseStageSort(window.location.search)} />
    </>
  );
}
