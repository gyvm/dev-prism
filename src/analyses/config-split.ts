import type { UnifiedConfig } from "../shared/config.js";
import type { RuntimeConfig } from "../shared/types.js";

// Design D5: config is split by *when* it takes effect.
//
// - Build-time config is baked into the DWH at ingest (e.g. bot patterns →
//   actors.is_bot, ingest caps). Changing it requires a rebuild, not a requery.
// - Query-time config is passed per request via `scope.thresholds` and can be
//   varied freely at read time without touching the DWH.
//
// Keeping the partition explicit prevents query-time knobs from leaking into
// the DWH (which would force rebuilds) and vice-versa.

export type BuildTimeConfig = Readonly<{
  /** Login patterns that mark an actor as a bot; baked into actors.is_bot. */
  botPatterns: readonly string[];
}>;

export type QueryTimeConfig = Readonly<{
  /** Thresholds fed to `scope.thresholds` (varied at read time). */
  thresholds: Readonly<Record<string, number>>;
}>;

/** Config that must be applied at DWH build time. */
export function buildTimeConfig(config: UnifiedConfig): BuildTimeConfig {
  return { botPatterns: config.bots.patterns };
}

/** Config that is applied at query time (carried by the scope). */
export function queryTimeConfig(runtime: Pick<RuntimeConfig, "firstReviewThresholdHours">): QueryTimeConfig {
  return { thresholds: { firstReviewThresholdHours: runtime.firstReviewThresholdHours } };
}
