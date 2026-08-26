import type { PrTimeline } from "../../shared/types.js";

export type PrTimelineOutput = {
  weekStart: string;
  weekEnd: string;
  timezone: string;
  timelines: PrTimeline[];
};
