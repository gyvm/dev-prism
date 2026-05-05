import type { NormalizedPullRequest } from "../shared/types.js";
import { getWeekBoundaries } from "../shared/timezone.js";

function inRange(value: string | null | undefined, start: Date, end: Date): boolean {
  if (!value) return false;
  const timestamp = new Date(value).getTime();
  return timestamp >= start.getTime() && timestamp <= end.getTime();
}

export function getReportWeek(date: Date, timezone: string): { start: Date; end: Date } {
  return getWeekBoundaries(date, timezone);
}

export function hasPrActivityInWeek(
  pr: NormalizedPullRequest,
  start: Date,
  end: Date,
): boolean {
  if (inRange(pr.createdAt, start, end)) return true;
  if (inRange(pr.mergedAt, start, end)) return true;
  if (inRange(pr.closedAt, start, end)) return true;

  for (const review of pr.reviews) {
    if (inRange(review.submittedAt, start, end)) return true;
  }
  for (const event of pr.timelineEvents) {
    if (inRange(event.createdAt, start, end)) return true;
  }
  for (const comment of pr.comments) {
    if (inRange(comment.createdAt, start, end)) return true;
  }
  for (const thread of pr.reviewThreads) {
    for (const comment of thread.comments) {
      if (inRange(comment.createdAt, start, end)) return true;
    }
  }

  return false;
}

export function selectActiveWeekPrs(
  prs: readonly NormalizedPullRequest[],
  start: Date,
  end: Date,
  limit: number,
): NormalizedPullRequest[] {
  return prs
    .filter((pr) => hasPrActivityInWeek(pr, start, end))
    .sort((a, b) => {
      const aTime = new Date(a.mergedAt ?? a.closedAt ?? a.createdAt).getTime();
      const bTime = new Date(b.mergedAt ?? b.closedAt ?? b.createdAt).getTime();
      return bTime - aTime;
    })
    .slice(0, limit);
}
