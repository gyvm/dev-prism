import type { NormalizedPullRequest } from "../shared/types.js";
import { formatRepoSlug } from "../shared/types.js";
import type {
  ReportLimits,
  ReportCommentInput,
  ReportInput,
  ReportPrInput,
} from "./types.js";
import { hasPrActivityInWeek, selectActiveWeekPrs } from "../shared/week.js";

function truncateText(value: string | null | undefined, maxLength: number): string | null {
  if (!value) return value ?? null;
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength)}\n[truncated ${value.length - maxLength} chars]`;
}

function firstCommitAt(pr: NormalizedPullRequest): string | null {
  const commits = [...pr.commits].sort((a, b) =>
    a.committedDate.localeCompare(b.committedDate),
  );
  return commits[0]?.committedDate ?? null;
}

function conversationCount(pr: NormalizedPullRequest): number {
  return (
    pr.comments.length +
    pr.reviews.filter((review) => review.bodyText?.trim()).length +
    pr.reviewThreads.reduce((sum, thread) => sum + thread.comments.length, 0)
  );
}

function projectPr(pr: NormalizedPullRequest, limits: ReportLimits): ReportPrInput {
  const truncation: string[] = [];

  const comments = pr.comments.slice(0, limits.maxCommentsPerPr);
  if (pr.comments.length > comments.length) {
    truncation.push(`PR comments truncated to ${comments.length}`);
  }

  const threads = pr.reviewThreads.slice(0, limits.maxReviewThreadsPerPr);
  if (pr.reviewThreads.length > threads.length) {
    truncation.push(`Review threads truncated to ${threads.length}`);
  }

  const files = (pr.files ?? []).slice(0, limits.maxFilesPerPr);
  if ((pr.files?.length ?? 0) > files.length) {
    truncation.push(`Changed files truncated to ${files.length}`);
  }

  const commits = pr.commits.slice(0, limits.maxCommitsPerPr);
  if (pr.commits.length > commits.length) {
    truncation.push(`Commits truncated to ${commits.length}`);
  }

  const reviewComments: ReportCommentInput[] = pr.reviews
    .filter((review) => review.bodyText?.trim())
    .map((review) => ({
      source: "review",
      author: review.author,
      bodyText: truncateText(review.bodyText, limits.maxBodyLength) ?? "",
      createdAt: review.submittedAt ?? pr.createdAt,
      url: null,
      state: review.state,
    }));

  return {
    repo: formatRepoSlug(pr.repo),
    number: pr.number,
    title: pr.title,
    url: pr.url ?? null,
    author: pr.author,
    state: pr.state ?? (pr.mergedAt ? "MERGED" : pr.closedAt ? "CLOSED" : "OPEN"),
    bodyText: truncateText(pr.bodyText, limits.maxBodyLength),
    labels: pr.labels.map((label) => label.name),
    createdAt: pr.createdAt,
    mergedAt: pr.mergedAt,
    closedAt: pr.closedAt,
    additions: pr.additions,
    deletions: pr.deletions,
    firstCommitAt: firstCommitAt(pr),
    comments: [
      ...comments.map((comment) => ({
        source: "pr_comment" as const,
        author: comment.author,
        bodyText: truncateText(comment.bodyText, limits.maxBodyLength) ?? "",
        createdAt: comment.createdAt,
        url: comment.url,
      })),
      ...reviewComments,
    ],
    reviewThreads: threads.map((thread) => ({
      isResolved: thread.isResolved,
      isOutdated: thread.isOutdated,
      path: thread.path,
      line: thread.line,
      comments: thread.comments.map((comment) => ({
        source: "review_thread" as const,
        author: comment.author,
        bodyText: truncateText(comment.bodyText, limits.maxBodyLength) ?? "",
        createdAt: comment.createdAt,
        url: comment.url,
        path: comment.path,
        line: comment.line,
      })),
    })),
    reviews: pr.reviews.map((review) => ({
      author: review.author,
      state: review.state,
      submittedAt: review.submittedAt,
      bodyText: truncateText(review.bodyText, limits.maxBodyLength),
    })),
    files,
    commits,
    truncation,
  };
}

export function buildReportInput(options: {
  pullRequests: readonly NormalizedPullRequest[];
  generatedAt: Date;
  timezone: string;
  weekStart: Date;
  weekEnd: Date;
  limits: ReportLimits;
}): ReportInput {
  const warnings: string[] = [];
  const selected = selectActiveWeekPrs(
    options.pullRequests,
    options.weekStart,
    options.weekEnd,
    options.limits.maxPrs,
  );

  const activeCount = options.pullRequests.filter((pr) =>
    hasPrActivityInWeek(pr, options.weekStart, options.weekEnd),
  ).length;
  if (activeCount > selected.length) {
    warnings.push(`Active PRs truncated to ${selected.length}`);
  }

  const prs = selected.map((pr) => projectPr(pr, options.limits));
  for (const rawPr of selected) {
    if (conversationCount(rawPr) === 0) {
      warnings.push(`${formatRepoSlug(rawPr.repo)}#${rawPr.number} has no collected conversation comments`);
    }
  }

  return {
    generatedAt: options.generatedAt.toISOString(),
    timezone: options.timezone,
    week: {
      start: options.weekStart.toISOString(),
      end: options.weekEnd.toISOString(),
    },
    prs,
    warnings,
  };
}
