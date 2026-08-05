import { buildActivityTrendSql } from "./activity-trend/query.js";
import { buildCycleFunnelSql, buildLeadTrendSql, buildPrStageTimesSql } from "./cycle-time/query.js";
import { buildDoraSql } from "./dora-metrics/query.js";
import { buildReviewCorrelationSql } from "./review-correlation/query.js";
import {
  buildReviewerLeadSql,
  buildReviewlessMergesSql,
  buildSizePickupScatterSql,
} from "./review-metrics/query.js";
import type { Scope } from "./scope.js";

// Shared SQL for the Explore default dashboard. DuckDB-WASM (Explore) imports
// this and runs the identical SQL that DuckDB-native (Reports) runs through the
// per-analysis query functions — the design D4 parity guarantee, by sharing one
// module instead of duplicating SQL on the browser side.
//
// Two analyses are deliberately absent. pr-timeline is a TS state machine over
// thin-pulled rows, not one SQL statement. The aging-page queries need a `nowTs`
// literal argument, which `Scope` alone cannot produce (aging/query.ts's
// `agingNowTs`) — admitting them would turn this record of plain SQL strings
// into a record of partially-applied functions for everyone else's sake.

export type DashboardSql = Readonly<{
  activityTrend: string;
  dora: string;
  reviewCorrelation: Readonly<{ authors: string; reviewers: string; pairs: string }>;
  cycleFunnel: string;
  leadTrend: string;
  prStageTimes: string;
  reviewlessMerges: string;
  sizePickupScatter: string;
  reviewerLead: string;
}>;

export function buildDashboardSql(scope: Scope): DashboardSql {
  return {
    activityTrend: buildActivityTrendSql(scope),
    dora: buildDoraSql(scope),
    reviewCorrelation: buildReviewCorrelationSql(scope),
    cycleFunnel: buildCycleFunnelSql(scope),
    leadTrend: buildLeadTrendSql(scope),
    prStageTimes: buildPrStageTimesSql(scope),
    reviewlessMerges: buildReviewlessMergesSql(scope),
    sizePickupScatter: buildSizePickupScatterSql(scope),
    reviewerLead: buildReviewerLeadSql(scope),
  };
}
