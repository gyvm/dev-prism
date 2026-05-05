import type { PrMetrics, AggregateMetrics } from "../../../shared/types.js";

export function median(sorted: number[]): number | null {
  if (sorted.length === 0) return null;
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) {
    const value = sorted[mid];
    if (value === undefined) return null;
    return value;
  }
  const a = sorted[mid - 1];
  const b = sorted[mid];
  if (a === undefined || b === undefined) return null;
  return (a + b) / 2;
}

export function percentile90(sorted: number[]): number | null {
  if (sorted.length === 0) return null;
  const index = Math.ceil(sorted.length * 0.9) - 1;
  const value = sorted[index];
  if (value === undefined) return null;
  return value;
}

export function average(values: number[]): number | null {
  if (values.length === 0) return null;
  const sum = values.reduce((acc, v) => acc + v, 0);
  return sum / values.length;
}

export function computeAggregateMetrics(
  prs: PrMetrics[],
  firstReviewThresholdHours: number,
): AggregateMetrics {
  const mergedPrs = prs.filter((pr) => pr.mergedAt !== null);
  const leadTimes = mergedPrs
    .map((pr) => pr.leadTimeHours)
    .filter((v): v is number => v !== null)
    .sort((a, b) => a - b);

  const firstReviewTimes = prs
    .map((pr) => pr.timeToFirstReviewHours)
    .filter((v): v is number => v !== null);

  const noReviewCount = prs.filter(
    (pr) => pr.timeToFirstReviewHours === null,
  ).length;

  const thresholdExceededCount = prs.filter(
    (pr) =>
      pr.timeToFirstReviewHours !== null &&
      pr.timeToFirstReviewHours > firstReviewThresholdHours,
  ).length;

  return {
    totalPrCount: prs.length,
    mergedPrCount: mergedPrs.length,
    noReviewCount,
    thresholdExceededCount,
    averageLeadTimeHours: average(leadTimes),
    medianLeadTimeHours: median(leadTimes),
    p90LeadTimeHours: percentile90(leadTimes),
    averageTimeToFirstReviewHours: average(firstReviewTimes),
  };
}
