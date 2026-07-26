import type { ReactElement } from "react";

import { queryActivityTrend } from "../../analyses/activity-trend/query.js";
import { queryReviewCorrelation } from "../../analyses/review-correlation/query.js";
import {
  queryReviewerLead,
  queryReviewlessMerges,
  querySizePickupScatter,
} from "../../analyses/review-metrics/query.js";
import type { Scope } from "../../analyses/scope.js";
import type { DwhQueryRunner } from "../../warehouse/runner.js";
import BipartiteGraph from "./BipartiteGraph.js";
import ReviewerLeadBars from "./ReviewerLeadBars.js";
import ReviewlessMergeCard from "./ReviewlessMergeCard.js";
import SizePickupScatter from "./SizePickupScatter.js";
import TrendChart, { TREND_COLORS } from "./TrendChart.js";
//
// Review: two questions in one page (docs/explore-screens.md §2). Block A — is
// review actually happening (2-1 review-less merges, 2-2 volume, 2-3 size vs
// pickup)? Block B — is the load balanced (2-4 correlation, 2-5 reviewer lead)?
//
// The review/comment counts get their own chart rather than sharing the flow
// chart's axis — they run an order of magnitude higher, so a shared scale
// flattens the PR lines (and a second y-axis is never the answer).
export async function renderReviewView(
  runner: DwhQueryRunner,
  scope: Scope,
): Promise<ReactElement> {
  const [reviewless, trend, scatter, correlation, reviewerLead] = await Promise.all([
    queryReviewlessMerges(runner, scope),
    queryActivityTrend(runner, scope),
    querySizePickupScatter(runner, scope),
    queryReviewCorrelation(runner, scope),
    queryReviewerLead(runner, scope),
  ]);

  return (
    <>
      <ReviewlessMergeCard data={reviewless} />
      <TrendChart
        title="レビュー・コメント件数の推移"
        buckets={trend.buckets}
        grain={trend.grain}
        series={[
          { key: "reviews", label: "レビュー", color: TREND_COLORS.reviews },
          { key: "comments", label: "コメント", color: TREND_COLORS.comments },
        ]}
      />
      <SizePickupScatter scatter={scatter} />
      <BipartiteGraph data={correlation} />
      <ReviewerLeadBars data={reviewerLead} />
    </>
  );
}
