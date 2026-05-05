import type { AnalysisContext } from "../context.js";
import { calculatePrMetrics } from "./internal/calculate.js";
import { computeAggregateMetrics } from "./internal/aggregate.js";
import { computeDora } from "./internal/dora.js";

const DEFAULT_FIRST_REVIEW_THRESHOLD_HOURS = 48;

export function compute(ctx: AnalysisContext): unknown {
  const threshold =
    (ctx.config["firstReviewThresholdHours"] as number | undefined) ??
    DEFAULT_FIRST_REVIEW_THRESHOLD_HOURS;
  const prMetrics = ctx.rawPrs.map(calculatePrMetrics);
  const aggregate = computeAggregateMetrics(prMetrics, threshold);
  return computeDora(ctx.rawPrs, aggregate);
}
