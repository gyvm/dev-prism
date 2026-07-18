import type { ReactElement } from "react";

import { queryActivityTrend } from "../../analyses/activity-trend/query.js";
import { queryDora } from "../../analyses/dora-metrics/query.js";
import type { Scope } from "../../analyses/scope.js";
import type { DwhQueryRunner } from "../../warehouse/runner.js";
import { MetricCards } from "../../renderers/metric-cards.js";
import TrendChart, { TREND_COLORS } from "./TrendChart.js";

// Flow: how fast and how steadily change reaches main.
//
// MetricCards is imported from renderers/ rather than duplicated: it is static
// markup with no inline script, the one renderer the Step 4 presentation split
// does not need its own copy of.
export async function renderFlowView(
  runner: DwhQueryRunner,
  scope: Scope,
): Promise<ReactElement> {
  const [dora, trend] = await Promise.all([
    queryDora(runner, scope),
    queryActivityTrend(runner, scope),
  ]);

  return (
    <>
      <MetricCards dora={dora} />
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
