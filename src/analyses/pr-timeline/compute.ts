import type { PrTimeline } from "../../shared/types.js";
import type { AnalysisContext } from "../context.js";
import { ConfigError } from "../../shared/errors.js";
import { selectTimelinePrs } from "./internal/timeline.js";

export type PrTimelineOutput = {
  weekStart: string;
  weekEnd: string;
  timezone: string;
  timelines: PrTimeline[];
};

function parseLimit(raw: unknown): number | undefined {
  if (raw === undefined) return undefined;
  if (typeof raw !== "number" || !Number.isFinite(raw) || raw < 0) {
    throw new ConfigError(
      `pr-timeline "limit" must be a non-negative finite number, got: ${JSON.stringify(raw)}`,
    );
  }
  return raw;
}

export function compute(ctx: AnalysisContext): PrTimelineOutput {
  const limit = parseLimit(ctx.config["limit"]);
  const timelines = selectTimelinePrs(
    ctx.rawPrs,
    ctx.weekStart,
    ctx.weekEnd,
    limit,
    ctx.isBotLogin,
  );
  return {
    weekStart: ctx.weekStart.toISOString(),
    weekEnd: ctx.weekEnd.toISOString(),
    timezone: ctx.timezone,
    timelines,
  };
}
