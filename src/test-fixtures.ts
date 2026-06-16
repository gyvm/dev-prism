import type { NormalizedPullRequest, PrMetrics } from "./shared/types.js";
import { neverBotLogin } from "./shared/bot.js";
import type { AnalysisContext } from "./analyses/context.js";
import type { ReportInput } from "./report/types.js";

export function makePr(
  overrides?: Partial<NormalizedPullRequest>,
): NormalizedPullRequest {
  return {
    repo: { owner: "test", name: "repo" },
    number: 1,
    title: "Test PR",
    author: "alice",
    createdAt: "2026-03-01T00:00:00.000Z",
    updatedAt: "2026-03-01T00:00:00.000Z",
    mergedAt: null,
    closedAt: null,
    additions: 50,
    deletions: 10,
    labels: [],
    reviews: [],
    reviewRequests: [],
    isDraft: false,
    timelineEvents: [],
    comments: [],
    reviewThreads: [],
    commits: [],
    ...overrides,
  };
}

type MakeAnalysisContextOptions = Readonly<{
  prs?: readonly NormalizedPullRequest[];
  weekStart?: Date;
  weekEnd?: Date;
  timezone?: string;
  config?: Record<string, unknown>;
  isBotLogin?: (login: string) => boolean;
}>;

export function makeAnalysisContext(
  options: MakeAnalysisContextOptions = {},
): AnalysisContext {
  const weekStart = options.weekStart ?? new Date("2026-04-27T00:00:00.000Z");
  const weekEnd =
    options.weekEnd ?? new Date("2026-05-03T23:59:59.999Z");
  const reportInput: ReportInput = {
    generatedAt: new Date("2026-05-04T00:00:00.000Z").toISOString(),
    timezone: options.timezone ?? "UTC",
    week: { start: weekStart.toISOString(), end: weekEnd.toISOString() },
    prs: [],
    warnings: [],
  };
  return {
    rawPrs: options.prs ?? [],
    input: reportInput,
    now: new Date("2026-05-04T00:00:00.000Z"),
    timezone: options.timezone ?? "UTC",
    weekStart,
    weekEnd,
    config: options.config ?? {},
    isBotLogin: options.isBotLogin ?? neverBotLogin,
  };
}

export function makePrMetrics(
  overrides?: Partial<PrMetrics>,
): PrMetrics {
  return {
    repo: { owner: "test", name: "repo" },
    number: 1,
    title: "Test PR",
    author: "alice",
    createdAt: "2026-03-01T00:00:00.000Z",
    mergedAt: null,
    leadTimeHours: null,
    timeToFirstReviewHours: null,
    timeToMergeAfterFirstReviewHours: null,
    firstReviewedAt: null,
    prSize: "small",
    totalLinesChanged: 60,
    ...overrides,
  };
}
