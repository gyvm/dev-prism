import type { NormalizedPullRequest } from "../shared/types.js";
import type { BotLoginMatcher } from "../shared/bot.js";
import type { ReportInput } from "../report/types.js";

export type AnalysisContext = Readonly<{
  rawPrs: readonly NormalizedPullRequest[];
  input: ReportInput;
  now: Date;
  timezone: string;
  weekStart: Date;
  weekEnd: Date;
  config: Record<string, unknown>;
  isBotLogin: BotLoginMatcher;
}>;
