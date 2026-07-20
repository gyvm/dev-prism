/** Derived state of an open PR on the aging page (evaluated in priority order). */
export type AgingStatus = "draft" | "approved" | "changes_requested" | "awaiting_review";

export const AGING_HISTOGRAM_BUCKETS: readonly string[] = [
  "<1d",
  "1-3d",
  "3-7d",
  "7-14d",
  "14d+",
];

/** 4-1: three headline numbers for the open-PR backlog. */
export type AgingSummary = Readonly<{
  openCount: number;
  awaitingReviewCount: number; // exactly the PRs whose status is "awaiting_review"
  oldestAgeDays: number | null; // null when there are no open PRs
}>;

/** 4-2: one open PR row. */
export type AgingPr = Readonly<{
  number: number;
  title: string | null;
  url: string | null;
  repoKey: string;
  author: string | null;
  status: AgingStatus;
  ballHolder: string | null; // reviewer login(s) when awaiting_review, else author
  ageHours: number; // since created_at
  createdAt: string;
  updatedAt: string;
}>;

export type AgingTable = Readonly<{ prs: readonly AgingPr[] }>;

/** 4-3: one age band with its open-PR count. */
export type AgingHistogramBucket = Readonly<{ bucket: string; count: number }>;

export type AgingHistogram = Readonly<{ buckets: readonly AgingHistogramBucket[] }>;
