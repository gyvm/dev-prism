import type { Grain } from "../scope.js";

/** The four cycle-time stages, in funnel order. */
export type CycleStageKey =
  | "commit_to_open"
  | "open_to_review"
  | "review_to_approve"
  | "approve_to_merge";

export const CYCLE_STAGE_KEYS: readonly CycleStageKey[] = [
  "commit_to_open",
  "open_to_review",
  "review_to_approve",
  "approve_to_merge",
];

/** One funnel stage: median hours and the count of PRs with both ends non-null. */
export type CycleFunnelStage = Readonly<{
  stage: number; // 1..4
  key: CycleStageKey;
  p50Hours: number | null; // null when the stage has no qualifying PR
  n: number;
}>;

/**
 * View-model for the cycle-time funnel (1-2). Each stage carries its own `n`
 * because the sample differs per stage (a PR contributes to a stage only when
 * both of that stage's boundary timestamps exist).
 */
export type CycleFunnel = Readonly<{
  stages: readonly CycleFunnelStage[]; // length 4, funnel order
}>;

/** One trend bucket: p50 hours + n for each of the four stages. */
export type LeadTrendBucket = Readonly<{
  bucket: string; // UTC ISO timestamp of the bucket start
  stages: readonly { p50Hours: number | null; n: number }[]; // length 4, index = stage-1
}>;

/** View-model for the lead-time trend (1-3): the funnel stages over time. */
export type LeadTrend = Readonly<{
  grain: Grain;
  buckets: readonly LeadTrendBucket[];
}>;

/** 3-2: per-PR stage durations for the sortable timeline table. */
export type PrStageTimes = Readonly<{
  number: number;
  title: string | null;
  url: string | null;
  repoKey: string;
  sizeLines: number;
  stageHours: readonly (number | null)[]; // length 4, index = stage-1
  mergedAt: string; // UTC ISO
}>;
