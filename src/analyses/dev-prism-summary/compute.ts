import type { AnalysisContext } from "../context.js";
import type {
  NormalizedPullRequest,
  PrMetrics,
} from "../../shared/types.js";
import { formatRepoSlug } from "../../shared/types.js";
import { diffHours } from "../../shared/datetime.js";
import { hasPrActivityInWeek, isMergedInWeek } from "../../shared/week.js";
import { median, average } from "../dora-metrics/internal/aggregate.js";
import { calculatePrMetrics } from "../dora-metrics/internal/calculate.js";
import type {
  DevPrismPrCandidate,
  DevPrismSummary,
} from "./types.js";

const MAX_CANDIDATES = 3;
const LONG_LEAD_TIME_MIN_HOURS = 24;
const LONG_REVIEW_WAIT_MIN_HOURS = 24;
const LARGE_PR_MIN_LINES = 300;
const QUICK_WIN_MAX_HOURS = 24;
const QUICK_WIN_MAX_LINES = 300;
const SMALL_PR_MAX_LINES = 120;
const STALE_OPEN_HOURS = 7 * 24;
const WAITING_AFTER_COMMENT_HOURS = 48;

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function formatHours(value: number | null): string {
  if (value === null) return "N/A";
  if (value < 1) return `${Math.round(value * 60)}分`;
  return `${round1(value)}h`;
}

function formatSignedHours(value: number | null): string {
  if (value === null) return "N/A";
  const sign = value > 0 ? "+" : "";
  return `${sign}${formatHours(value)}`;
}

function previousPeriod(weekStart: Date, weekEnd: Date): { start: Date; end: Date } {
  const durationMs = weekEnd.getTime() - weekStart.getTime();
  const end = new Date(weekStart.getTime() - 1);
  const start = new Date(end.getTime() - durationMs);
  return { start, end };
}

function formatPr(pr: NormalizedPullRequest): Pick<DevPrismPrCandidate, "repo" | "number" | "title" | "url" | "author"> {
  return {
    repo: formatRepoSlug(pr.repo),
    number: pr.number,
    title: pr.title,
    url: pr.url ?? null,
    author: pr.author,
  };
}

function candidate(
  pr: NormalizedPullRequest,
  metric: string,
): DevPrismPrCandidate {
  return {
    ...formatPr(pr),
    metric,
  };
}

function topBy<T>(items: readonly T[], score: (item: T) => number | null): T[] {
  return [...items]
    .map((item) => ({ item, score: score(item) }))
    .filter((entry): entry is { item: T; score: number } => entry.score !== null && Number.isFinite(entry.score))
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_CANDIDATES)
    .map((entry) => entry.item);
}

function uniqueParticipants(pr: NormalizedPullRequest): Set<string> {
  const users = new Set<string>();
  for (const review of pr.reviews) {
    if (review.author) users.add(review.author);
  }
  for (const comment of pr.comments) {
    if (comment.author) users.add(comment.author);
  }
  for (const thread of pr.reviewThreads) {
    for (const comment of thread.comments) {
      if (comment.author) users.add(comment.author);
    }
  }
  if (pr.author) users.delete(pr.author);
  return users;
}

function conversationCount(pr: NormalizedPullRequest): number {
  return (
    pr.comments.length +
    pr.reviews.filter((review) => review.bodyText?.trim()).length +
    pr.reviewThreads.reduce((sum, thread) => sum + thread.comments.length, 0)
  );
}

function latestInteractionAt(pr: NormalizedPullRequest): string | null {
  const dates = [
    pr.createdAt,
    pr.updatedAt,
    ...pr.comments.map((comment) => comment.updatedAt ?? comment.createdAt),
    ...pr.reviews.map((review) => review.updatedAt ?? review.submittedAt).filter((v): v is string => v !== null),
    ...pr.reviewThreads.flatMap((thread) =>
      thread.comments.map((comment) => comment.updatedAt ?? comment.createdAt),
    ),
  ];
  return dates.sort().at(-1) ?? null;
}

function firstReviewWaitHours(metric: PrMetrics, weekEnd: Date): number | null {
  if (metric.timeToFirstReviewHours !== null) return metric.timeToFirstReviewHours;
  if (metric.mergedAt !== null) return null;
  return diffHours(metric.createdAt, weekEnd.toISOString());
}

function analystComment(
  leadTimeHours: number | null,
  leadTimeDeltaHours: number | null,
  reviewWaitHours: number | null,
  mergedPrCount: number,
  activePrCount: number,
): string {
  if (mergedPrCount === 0) {
    return activePrCount === 0
      ? "対象期間にPR活動がなく、チームの流れを判断できる材料はありません。"
      : "対象期間にマージがないため、完了までの流れよりも未完了PRの滞留確認を優先するとよさそうです。";
  }
  const lead = formatHours(leadTimeHours);
  const review = formatHours(reviewWaitHours);
  const leadDelta = leadTimeDeltaHours === null ? "" : `前回比${formatSignedHours(leadTimeDeltaHours)}、`;
  if (leadTimeHours !== null && leadTimeHours >= 72) {
    return `今週のリードタイム中央値は${lead}で、${leadDelta}重めです。レビュー待ち(${review})、大型PR、議論が多いPRが影響している可能性があります。`;
  }
  if (reviewWaitHours !== null && reviewWaitHours >= 24) {
    return `今週のリードタイム中央値は${lead}です。${leadDelta}レビュー待ち平均が${review}あるため、初回レビューまでの流れを確認するとよさそうです。`;
  }
  return `今週のリードタイム中央値は${lead}で、${leadDelta}完了したPRは${mergedPrCount}件です。流れが良かったPRを拾い、再現できる進め方を確認するとよさそうです。`;
}

export function compute(ctx: AnalysisContext): DevPrismSummary {
  const activePrs = ctx.rawPrs.filter((pr) =>
    hasPrActivityInWeek(pr, ctx.weekStart, ctx.weekEnd),
  );
  const mergedPrs = ctx.rawPrs.filter((pr) =>
    isMergedInWeek(pr, ctx.weekStart, ctx.weekEnd),
  );
  const previous = previousPeriod(ctx.weekStart, ctx.weekEnd);
  const previousActivePrs = ctx.rawPrs.filter((pr) =>
    hasPrActivityInWeek(pr, previous.start, previous.end),
  );
  const previousMergedPrs = ctx.rawPrs.filter((pr) =>
    isMergedInWeek(pr, previous.start, previous.end),
  );
  const metricsByKey = new Map<string, PrMetrics>(
    activePrs.map((pr) => [`${formatRepoSlug(pr.repo)}#${pr.number}`, calculatePrMetrics(pr)]),
  );
  const mergedMetrics = mergedPrs
    .map((pr) => metricsByKey.get(`${formatRepoSlug(pr.repo)}#${pr.number}`) ?? calculatePrMetrics(pr));
  const leadTimes = mergedMetrics
    .map((pr) => pr.leadTimeHours)
    .filter((value): value is number => value !== null)
    .sort((a, b) => a - b);
  const reviewWaits = activePrs
    .map((pr) => {
      const m = metricsByKey.get(`${formatRepoSlug(pr.repo)}#${pr.number}`) ?? calculatePrMetrics(pr);
      return firstReviewWaitHours(m, ctx.weekEnd);
    })
    .filter((value): value is number => value !== null);
  const previousMetrics = previousActivePrs.map(calculatePrMetrics);
  const previousLeadTimeHours = median(
    previousMergedPrs
      .map(calculatePrMetrics)
      .map((pr) => pr.leadTimeHours)
      .filter((value): value is number => value !== null)
      .sort((a, b) => a - b),
  );
  const previousAverageReviewWaitHours = average(
    previousMetrics
      .map((m) => firstReviewWaitHours(m, previous.end))
      .filter((value): value is number => value !== null),
  );

  const leadTimeHours = median(leadTimes);
  const averageReviewWaitHours = average(reviewWaits);
  const leadTimeDeltaHours =
    leadTimeHours === null || previousLeadTimeHours === null
      ? null
      : leadTimeHours - previousLeadTimeHours;
  const reviewWaitDeltaHours =
    averageReviewWaitHours === null || previousAverageReviewWaitHours === null
      ? null
      : averageReviewWaitHours - previousAverageReviewWaitHours;
  const mergedPrDelta = mergedPrs.length - previousMergedPrs.length;
  const comment = analystComment(
    leadTimeHours,
    leadTimeDeltaHours,
    averageReviewWaitHours,
    mergedPrs.length,
    activePrs.length,
  );

  const longLeadTimePrs = topBy(mergedPrs.filter((pr) => {
    const m = metricsByKey.get(`${formatRepoSlug(pr.repo)}#${pr.number}`) ?? calculatePrMetrics(pr);
    return m.leadTimeHours !== null && m.leadTimeHours >= LONG_LEAD_TIME_MIN_HOURS;
  }), (pr) => {
    const m = metricsByKey.get(`${formatRepoSlug(pr.repo)}#${pr.number}`) ?? calculatePrMetrics(pr);
    return m.leadTimeHours;
  }).map((pr) => {
    const m = metricsByKey.get(`${formatRepoSlug(pr.repo)}#${pr.number}`) ?? calculatePrMetrics(pr);
    return candidate(pr, formatHours(m.leadTimeHours));
  });

  const longReviewWaitPrs = topBy(activePrs.filter((pr) => {
    const m = metricsByKey.get(`${formatRepoSlug(pr.repo)}#${pr.number}`) ?? calculatePrMetrics(pr);
    const wait = firstReviewWaitHours(m, ctx.weekEnd);
    return wait !== null && wait >= LONG_REVIEW_WAIT_MIN_HOURS;
  }), (pr) => {
    const m = metricsByKey.get(`${formatRepoSlug(pr.repo)}#${pr.number}`) ?? calculatePrMetrics(pr);
    return firstReviewWaitHours(m, ctx.weekEnd);
  }).map((pr) => {
    const m = metricsByKey.get(`${formatRepoSlug(pr.repo)}#${pr.number}`) ?? calculatePrMetrics(pr);
    return candidate(pr, formatHours(firstReviewWaitHours(m, ctx.weekEnd)));
  });

  const largePrs = topBy(
    activePrs.filter((pr) => pr.additions + pr.deletions >= LARGE_PR_MIN_LINES),
    (pr) => pr.additions + pr.deletions,
  ).map((pr) => candidate(pr, `${pr.additions + pr.deletions}行`));

  const debatedPrs = topBy(
    activePrs.filter((pr) => conversationCount(pr) > 0),
    conversationCount,
  ).map((pr) => candidate(pr, `${conversationCount(pr)}件の会話`));

  const quickWins = mergedPrs
    .filter((pr) => {
      const m = metricsByKey.get(`${formatRepoSlug(pr.repo)}#${pr.number}`) ?? calculatePrMetrics(pr);
      return (
        m.leadTimeHours !== null &&
        m.leadTimeHours <= QUICK_WIN_MAX_HOURS &&
        m.totalLinesChanged <= QUICK_WIN_MAX_LINES
      );
    })
    .sort((a, b) => {
      const ma = metricsByKey.get(`${formatRepoSlug(a.repo)}#${a.number}`) ?? calculatePrMetrics(a);
      const mb = metricsByKey.get(`${formatRepoSlug(b.repo)}#${b.number}`) ?? calculatePrMetrics(b);
      return (ma.leadTimeHours ?? 0) - (mb.leadTimeHours ?? 0);
    })
    .slice(0, MAX_CANDIDATES)
    .map((pr) => {
      const m = metricsByKey.get(`${formatRepoSlug(pr.repo)}#${pr.number}`) ?? calculatePrMetrics(pr);
      return candidate(pr, formatHours(m.leadTimeHours));
    });

  const smallButUseful = mergedPrs
    .filter((pr) => pr.additions + pr.deletions <= SMALL_PR_MAX_LINES)
    .sort((a, b) => (a.additions + a.deletions) - (b.additions + b.deletions))
    .slice(0, MAX_CANDIDATES)
    .map((pr) => candidate(pr, `${pr.additions + pr.deletions}行`));

  const collaborativePrs = topBy(
    activePrs.filter((pr) => uniqueParticipants(pr).size > 0),
    (pr) => uniqueParticipants(pr).size,
  ).map((pr) => candidate(pr, `${uniqueParticipants(pr).size}人が参加`));

  const staleOpenPrs = activePrs
    .filter((pr) => pr.mergedAt === null && pr.closedAt === null)
    .filter((pr) => diffHours(pr.createdAt, ctx.weekEnd.toISOString()) >= STALE_OPEN_HOURS)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .slice(0, MAX_CANDIDATES)
    .map((pr) =>
      candidate(pr, formatHours(diffHours(pr.createdAt, ctx.weekEnd.toISOString()))),
    );

  const unresolvedReviewPrs = activePrs
    .filter((pr) => pr.reviewThreads.some((thread) => thread.isResolved === false))
    .slice(0, MAX_CANDIDATES)
    .map((pr) =>
      candidate(
        pr,
        `${pr.reviewThreads.filter((thread) => thread.isResolved === false).length}件未解決`,
      ),
    );

  const waitingAfterCommentPrs = activePrs
    .filter((pr) => pr.mergedAt === null && pr.closedAt === null)
    .map((pr) => ({ pr, latest: latestInteractionAt(pr) }))
    .filter((entry): entry is { pr: NormalizedPullRequest; latest: string } => entry.latest !== null)
    .map((entry) => ({ ...entry, idleHours: diffHours(entry.latest, ctx.weekEnd.toISOString()) }))
    .filter((entry) => entry.idleHours >= WAITING_AFTER_COMMENT_HOURS)
    .sort((a, b) => b.idleHours - a.idleHours)
    .slice(0, MAX_CANDIDATES)
    .map(({ pr, idleHours }) => candidate(pr, `${formatHours(idleHours)}停止`));

  return {
    flowSnapshot: {
      leadTimeHours,
      previousLeadTimeHours,
      leadTimeDeltaHours,
      mergedPrCount: mergedPrs.length,
      previousMergedPrCount: previousMergedPrs.length,
      mergedPrDelta,
      averageReviewWaitHours,
      previousAverageReviewWaitHours,
      reviewWaitDeltaHours,
      activePrCount: activePrs.length,
      analystComment: comment,
    },
    whatChanged: {
      longLeadTimePrs,
      longReviewWaitPrs,
      largePrs,
      debatedPrs,
    },
    rememberThisWeek: {
      quickWins,
      smallButUseful,
      collaborativePrs,
    },
    needsFollowUp: {
      staleOpenPrs,
      unresolvedReviewPrs,
      waitingAfterCommentPrs,
    },
  };
}
