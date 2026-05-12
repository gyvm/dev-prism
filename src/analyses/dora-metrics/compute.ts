import type { AnalysisContext } from "../context.js";
import { isMergedInWeek } from "../../shared/week.js";
import { calculatePrMetrics } from "./internal/calculate.js";
import { computeAggregateMetrics } from "./internal/aggregate.js";
import { computeDora } from "./internal/dora.js";

const DEFAULT_FIRST_REVIEW_THRESHOLD_HOURS = 48;

export function compute(ctx: AnalysisContext): unknown {
  const threshold =
    (ctx.config["firstReviewThresholdHours"] as number | undefined) ??
    DEFAULT_FIRST_REVIEW_THRESHOLD_HOURS;
  const weekPrs = ctx.rawPrs.filter((pr) =>
    isMergedInWeek(pr, ctx.weekStart, ctx.weekEnd),
  );
  const prMetrics = weekPrs.map(calculatePrMetrics);
  const aggregate = computeAggregateMetrics(prMetrics, threshold);
  return computeDora(weekPrs, aggregate);
}
