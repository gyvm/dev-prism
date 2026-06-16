import type { Grain } from "../scope.js";

/** One time bucket of activity counts at the scope's grain. */
export type ActivityTrendBucket = Readonly<{
  bucket: string; // UTC ISO timestamp of the bucket start
  prOpened: number;
  prMerged: number;
  reviews: number;
  comments: number;
}>;

/**
 * View-model for the "件数推移" (activity trend) indicator. Aggregated from the
 * long `activities` fact at the requested grain — the contract a trend chart
 * (Explore live, or a future frozen Reports chart) consumes.
 */
export type ActivityTrend = Readonly<{
  grain: Grain;
  buckets: readonly ActivityTrendBucket[];
}>;
