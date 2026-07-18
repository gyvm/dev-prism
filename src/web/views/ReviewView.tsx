import type { ReactElement } from "react";

import { queryActivityTrend } from "../../analyses/activity-trend/query.js";
import { queryReviewCorrelation } from "../../analyses/review-correlation/query.js";
import type { Scope } from "../../analyses/scope.js";
import type { DwhQueryRunner } from "../../warehouse/runner.js";
import BipartiteGraph from "./BipartiteGraph.js";
import TrendChart, { TREND_COLORS } from "./TrendChart.js";

// Review: how review effort is distributed, and how much of it there is.
//
// The review/comment counts get their own chart rather than sharing the flow
// chart's axis — they run an order of magnitude higher, so a shared scale
// flattens the PR lines (and a second y-axis is never the answer).
//
// New review *metrics* (request→pickup lead time, thread resolution rate) are
// deliberately absent: they depend on the unresolved "is AI review signal or
// noise" decision. See docs/explore-views-plan.md Step 3.
export async function renderReviewView(
  runner: DwhQueryRunner,
  scope: Scope,
): Promise<ReactElement> {
  const [correlation, trend] = await Promise.all([
    queryReviewCorrelation(runner, scope),
    queryActivityTrend(runner, scope),
  ]);

  return (
    <>
      <TrendChart
        title="レビュー・コメント件数の推移"
        buckets={trend.buckets}
        grain={trend.grain}
        series={[
          { key: "reviews", label: "レビュー", color: TREND_COLORS.reviews },
          { key: "comments", label: "コメント", color: TREND_COLORS.comments },
        ]}
      />
      <BipartiteGraph data={correlation} />
    </>
  );
}
