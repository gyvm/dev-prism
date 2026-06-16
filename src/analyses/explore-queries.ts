import { buildActivityTrendSql } from "./activity-trend/query.js";
import { buildDoraSql } from "./dora-metrics/query.js";
import { buildReviewCorrelationSql } from "./review-correlation/query.js";
import type { Scope } from "./scope.js";

// Shared SQL for the Explore default dashboard. DuckDB-WASM (Explore) imports
// this and runs the identical SQL that DuckDB-native (Reports) runs through the
// per-analysis query functions — the design D4 parity guarantee, by sharing one
// module instead of duplicating SQL on the browser side. (pr-timeline is a TS
// state machine over thin-pulled rows, so it is not part of this SQL bundle.)

export type DashboardSql = Readonly<{
  activityTrend: string;
  dora: string;
  reviewCorrelation: Readonly<{ authors: string; reviewers: string; pairs: string }>;
}>;

export function buildDashboardSql(scope: Scope): DashboardSql {
  return {
    activityTrend: buildActivityTrendSql(scope),
    dora: buildDoraSql(scope),
    reviewCorrelation: buildReviewCorrelationSql(scope),
  };
}

export { buildActivityTrendSql, buildDoraSql, buildReviewCorrelationSql };
