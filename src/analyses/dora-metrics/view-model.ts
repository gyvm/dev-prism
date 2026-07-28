import type { DoraMetrics } from "../../shared/types.js";

/** Absolute change (current − previous) per DORA metric; null when either side is null. */
export type DoraDelta = Readonly<{
  deploymentFrequency: number | null;
  leadTimeForChangesHours: number | null;
  changeFailureRatePercent: number | null;
  mttrHours: number | null;
}>;

/**
 * View-model for the DORA cards with previous-period comparison (1-1b).
 * `previous`/`delta` are null when the scope is unbounded on either side or the
 * period is still in progress (docs/explore-screens.md データと数値の方針).
 */
export type DoraComparison = Readonly<{
  current: DoraMetrics;
  previous: DoraMetrics | null;
  delta: DoraDelta | null;
}>;
