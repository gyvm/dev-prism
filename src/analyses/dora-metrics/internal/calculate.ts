import type {
  NormalizedPullRequest,
  PrMetrics,
  PrSizeBucket,
} from "../../../shared/types.js";
import { diffHours } from "../../../shared/datetime.js";

const SIZE_SMALL_MAX = 99;
const SIZE_MEDIUM_MAX = 499;

export function findFirstReviewDate(
  reviews: NormalizedPullRequest["reviews"],
): string | null {
  let earliest: string | null = null;
  for (const review of reviews) {
    if (review.submittedAt !== null) {
      if (earliest === null || review.submittedAt < earliest) {
        earliest = review.submittedAt;
      }
    }
  }
  return earliest;
}

export function classifyPrSize(totalLinesChanged: number): PrSizeBucket {
  if (totalLinesChanged <= SIZE_SMALL_MAX) return "small";
  if (totalLinesChanged <= SIZE_MEDIUM_MAX) return "medium";
  return "large";
}

export function calculatePrMetrics(pr: NormalizedPullRequest): PrMetrics {
  const firstReviewedAt = findFirstReviewDate(pr.reviews);
  const totalLinesChanged = pr.additions + pr.deletions;

  const leadTimeHours =
    pr.mergedAt !== null ? diffHours(pr.createdAt, pr.mergedAt) : null;

  const timeToFirstReviewHours =
    firstReviewedAt !== null
      ? diffHours(pr.createdAt, firstReviewedAt)
      : null;

  const timeToMergeAfterFirstReviewHours =
    pr.mergedAt !== null && firstReviewedAt !== null
      ? diffHours(firstReviewedAt, pr.mergedAt)
      : null;

  return {
    repo: pr.repo,
    number: pr.number,
    title: pr.title,
    author: pr.author,
    createdAt: pr.createdAt,
    mergedAt: pr.mergedAt,
    leadTimeHours,
    timeToFirstReviewHours,
    timeToMergeAfterFirstReviewHours,
    firstReviewedAt,
    prSize: classifyPrSize(totalLinesChanged),
    totalLinesChanged,
  };
}
