import type { NormalizedPullRequest, PrMetrics } from "./shared/types.js";

export function makePr(
  overrides?: Partial<NormalizedPullRequest>,
): NormalizedPullRequest {
  return {
    repo: { owner: "test", name: "repo" },
    number: 1,
    title: "Test PR",
    author: "alice",
    createdAt: "2026-03-01T00:00:00.000Z",
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
