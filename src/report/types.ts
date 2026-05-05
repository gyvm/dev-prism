import type { NormalizedPullRequest } from "../shared/types.js";

export type ReportCaps = Readonly<{
  maxPrs: number;
  maxCommentsPerPr: number;
  maxReviewThreadsPerPr: number;
  maxFilesPerPr: number;
  maxCommitsPerPr: number;
  maxBodyLength: number;
}>;

export type ReportPrInput = Readonly<{
  repo: string;
  number: number;
  title: string;
  url: string | null;
  author: string | null;
  state: string | null;
  bodyText: string | null;
  labels: readonly string[];
  createdAt: string;
  mergedAt: string | null;
  closedAt: string | null;
  additions: number;
  deletions: number;
  firstCommitAt: string | null;
  comments: readonly ReportCommentInput[];
  reviewThreads: readonly ReportReviewThreadInput[];
  reviews: readonly ReportReviewInput[];
  files: readonly ReportFileInput[];
  commits: readonly ReportCommitInput[];
  truncation: readonly string[];
}>;

export type ReportCommentInput = Readonly<{
  source: "pr_comment" | "review" | "review_thread";
  author: string | null;
  bodyText: string;
  createdAt: string;
  url: string | null;
  path?: string | null;
  line?: number | null;
  state?: string | null;
}>;

export type ReportReviewThreadInput = Readonly<{
  isResolved: boolean | null;
  isOutdated: boolean | null;
  path: string | null;
  line: number | null;
  comments: readonly ReportCommentInput[];
}>;

export type ReportReviewInput = Readonly<{
  author: string | null;
  state: string | null;
  submittedAt: string | null;
  bodyText: string | null;
}>;

export type ReportFileInput = Readonly<{
  path: string;
  additions: number;
  deletions: number;
  changeType: string | null;
}>;

export type ReportCommitInput = Readonly<{
  oid: string;
  committedDate: string;
  messageHeadline: string;
  author: string | null;
}>;

export type ReportInput = Readonly<{
  generatedAt: string;
  timezone: string;
  week: {
    start: string;
    end: string;
  };
  prs: readonly ReportPrInput[];
  warnings: readonly string[];
}>;
