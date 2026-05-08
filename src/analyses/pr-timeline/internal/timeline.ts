import { neverBotLogin, type BotLoginMatcher } from "../../../shared/bot.js";
import type {
  NormalizedPullRequest,
  PrTimeline,
  TimelineAuxiliary,
  TimelineSegment,
} from "../../../shared/types.js";
import { diffHours } from "../../../shared/datetime.js";
import { selectActiveWeekPrs } from "../../../shared/week.js";
import {
  closingStateOf,
  firstApproveAt,
  firstAuthoredDate,
  makeSegment,
  readyForReviewAt,
} from "./boundaries.js";
import {
  resolveReactions,
  type ResolvedReactions,
} from "./reactions.js";

function computeAuxiliary(
  pr: NormalizedPullRequest,
  approveAt: string | null,
  resolved: ResolvedReactions,
): TimelineAuxiliary {
  const approveCount = pr.reviews.filter((r) => r.state === "APPROVED").length;
  const dismissCount = pr.reviews.filter((r) => r.state === "DISMISSED").length;
  const reviewCommentCount = resolved.reactions.length;
  const postApproveCommitCount =
    approveAt === null
      ? 0
      : pr.commits.filter((c) => c.authoredDate > approveAt).length;
  return {
    firstCommitAt: firstAuthoredDate(pr),
    readyForReviewAt: readyForReviewAt(pr),
    firstReaction: resolved.firstReaction,
    firstApproveAt: approveAt,
    approveCount,
    dismissCount,
    reviewCommentCount,
    postApproveCommitCount,
    closingState: closingStateOf(pr),
    mergedAt: pr.mergedAt,
    closedAt: pr.closedAt,
  };
}

export function buildPrTimeline(
  pr: NormalizedPullRequest,
  weekEnd: string,
  isBotLogin: BotLoginMatcher = neverBotLogin,
): PrTimeline {
  const endpoint = pr.mergedAt ?? pr.closedAt ?? weekEnd;
  const approveAt = firstApproveAt(pr);
  const resolved = resolveReactions(pr, isBotLogin);
  const reactionAt = resolved.firstReaction?.at ?? null;

  const boundaries: string[] = [
    firstAuthoredDate(pr) ?? pr.createdAt,
    readyForReviewAt(pr) ?? endpoint,
    reactionAt ?? endpoint,
    approveAt ?? endpoint,
    endpoint,
  ];
  for (let i = 1; i < boundaries.length; i++) {
    if (boundaries[i]! < boundaries[i - 1]!) {
      boundaries[i] = boundaries[i - 1]!;
    }
  }

  const segments: TimelineSegment[] = [
    makeSegment("implementing", boundaries[0]!, boundaries[1]!),
    makeSegment("wait_review", boundaries[1]!, boundaries[2]!),
    makeSegment("fixing", boundaries[2]!, boundaries[3]!),
    makeSegment("wait_merge", boundaries[3]!, boundaries[4]!),
  ];

  const totalDurationHours = Math.max(
    0,
    diffHours(boundaries[0]!, boundaries[4]!),
  );

  return {
    repo: pr.repo,
    number: pr.number,
    title: pr.title,
    author: pr.author,
    totalDurationHours,
    segments,
    auxiliary: computeAuxiliary(pr, approveAt, resolved),
  };
}

const DEFAULT_LIMIT = Number.MAX_SAFE_INTEGER;

export function selectTimelinePrs(
  prs: readonly NormalizedPullRequest[],
  weekStart: Date,
  weekEnd: Date,
  limit?: number,
  isBotLogin: BotLoginMatcher = neverBotLogin,
): PrTimeline[] {
  const active = selectActiveWeekPrs(
    prs,
    weekStart,
    weekEnd,
    limit ?? DEFAULT_LIMIT,
  );
  const weekEndIso = weekEnd.toISOString();
  return active.map((pr) => buildPrTimeline(pr, weekEndIso, isBotLogin));
}
