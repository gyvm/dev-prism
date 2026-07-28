import type { ReactElement } from "react";

import { queryActivityTrend } from "../../analyses/activity-trend/query.js";
import { queryCycleFunnel, queryLeadTrend } from "../../analyses/cycle-time/query.js";
import { queryDoraComparison } from "../../analyses/dora-metrics/query.js";
import type { Scope } from "../../analyses/scope.js";
import type { DwhQueryRunner } from "../../warehouse/runner.js";
import CycleFunnel from "./CycleFunnel.js";
import DoraComparisonCards from "./DoraComparisonCards.js";
import LeadTrendChart from "./LeadTrendChart.js";
import { buildStageDrilldownHref } from "./stage-drilldown-url.js";
import TrendChart, { TREND_COLORS } from "./TrendChart.js";

// Flow: how fast and how steadily change reaches main. The retro's entry point,
// ordered サマリ→分解→時系列 (docs/explore-screens.md §1): 1-1b says "slow",
// 1-2 says where, 1-3 says since when, 1-4 gives the volume it happened at.
//
// The funnel's stage cards link into the timeline view's stage table, sorted by
// that stage — the aggregate-to-example path the spec asks for.
export async function renderFlowView(
  runner: DwhQueryRunner,
  scope: Scope,
): Promise<ReactElement> {
  const [dora, funnel, leadTrend, trend] = await Promise.all([
    queryDoraComparison(runner, scope),
    queryCycleFunnel(runner, scope),
    queryLeadTrend(runner, scope),
    queryActivityTrend(runner, scope),
  ]);

  return (
    <>
      <DoraComparisonCards comparison={dora} />
      <CycleFunnel funnel={funnel} stageHref={(key) => buildStageDrilldownHref(scope, key)} />
      <LeadTrendChart trend={leadTrend} />
      <TrendChart
        title="PR 件数の推移"
        buckets={trend.buckets}
        grain={trend.grain}
        series={[
          { key: "prOpened", label: "作成", color: TREND_COLORS.prOpened },
          { key: "prMerged", label: "マージ", color: TREND_COLORS.prMerged },
        ]}
      />
    </>
  );
}
