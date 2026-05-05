import type { PrTimeline } from "../../shared/types.js";
import type { AnalysisContext } from "../context.js";
import { selectTimelinePrs } from "./internal/timeline.js";

export type PrTimelineOutput = {
  weekStart: string;
  weekEnd: string;
  timezone: string;
  timelines: PrTimeline[];
};

export function compute(ctx: AnalysisContext): PrTimelineOutput {
  const limit = ctx.config["limit"] as number | undefined;
  const weekEnd = ctx.weekEnd.toISOString();
  const timelines = selectTimelinePrs(ctx.rawPrs, weekEnd, limit, ctx.isBotLogin);
  return {
    weekStart: ctx.weekStart.toISOString(),
    weekEnd,
    timezone: ctx.timezone,
    timelines,
  };
}
