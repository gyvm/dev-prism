import { neverBotLogin, type BotLoginMatcher } from "../../../shared/bot.js";
import type {
  NormalizedPullRequest,
  PrTimeline,
  TimelineAuxiliary,
  TimelineClosingState,
  TimelineSegment,
  TimelineState,
} from "../../../shared/types.js";
import { diffHours } from "../../dora-metrics/internal/calculate.js";

function earliest(values: readonly (string | null | undefined)[]): string | null {
  let min: string | null = null;
  for (const value of values) {
    if (typeof value !== "string") continue;
    if (min === null || value < min) min = value;
  }
  return min;
}

function firstAuthoredDate(pr: NormalizedPullRequest): string | null {
  return earliest(pr.commits.map((c) => c.authoredDate));
}

function readyForReviewAt(pr: NormalizedPullRequest): string | null {
  const ready = earliest(
    pr.timelineEvents
      .filter((e) => e.type === "ready_for_review")
      .map((e) => e.createdAt),
  );
  if (ready !== null) return ready;
  return pr.isDraft ? null : pr.createdAt;
}

function isExternalReaction(
  pr: NormalizedPullRequest,
  author: string | null,
  isBotLogin: BotLoginMatcher,
): boolean {
  if (author === null) return false;
  if (pr.author !== null && author === pr.author) return false;
  if (isBotLogin(author)) return false;
  return true;
}

function reactionTimestamps(
  pr: NormalizedPullRequest,
  isBotLogin: BotLoginMatcher,
): string[] {
  const out: string[] = [];
  for (const review of pr.reviews) {
    if (review.submittedAt === null) continue;
    if (review.state === "PENDING" || review.state === "DISMISSED") continue;
    if (!isExternalReaction(pr, review.author, isBotLogin)) continue;
    out.push(review.submittedAt);
  }
  for (const comment of pr.comments) {
    if (!isExternalReaction(pr, comment.author, isBotLogin)) continue;
    out.push(comment.createdAt);
  }
  for (const thread of pr.reviewThreads) {
    for (const comment of thread.comments) {
      if (!isExternalReaction(pr, comment.author, isBotLogin)) continue;
      out.push(comment.createdAt);
    }
  }
  return out;
}

function findFirstReaction(
  pr: NormalizedPullRequest,
  isBotLogin: BotLoginMatcher,
): { at: string; by: string } | null {
  let best: { at: string; by: string } | null = null;
  const consider = (at: string, by: string | null): void => {
    if (by === null) return;
    if (best === null || at < best.at) best = { at, by };
  };
  for (const review of pr.reviews) {
    if (review.submittedAt === null) continue;
    if (review.state === "PENDING" || review.state === "DISMISSED") continue;
    if (!isExternalReaction(pr, review.author, isBotLogin)) continue;
    consider(review.submittedAt, review.author);
  }
  for (const comment of pr.comments) {
    if (!isExternalReaction(pr, comment.author, isBotLogin)) continue;
    consider(comment.createdAt, comment.author);
  }
  for (const thread of pr.reviewThreads) {
    for (const comment of thread.comments) {
      if (!isExternalReaction(pr, comment.author, isBotLogin)) continue;
      consider(comment.createdAt, comment.author);
    }
  }
  return best;
}

function firstApproveAt(pr: NormalizedPullRequest): string | null {
  return earliest(
    pr.reviews
      .filter((r) => r.state === "APPROVED" && r.submittedAt !== null)
      .map((r) => r.submittedAt),
  );
}

function makeSegment(
  state: TimelineState,
  start: string,
  end: string,
): TimelineSegment {
  const duration = Math.max(0, diffHours(start, end));
  return { state, startAt: start, endAt: end, durationHours: duration };
}

function closingStateOf(pr: NormalizedPullRequest): TimelineClosingState {
  if (pr.mergedAt !== null) return "merged";
  if (pr.closedAt !== null) return "closed_unmerged";
  return "open";
}

function computeAuxiliary(
  pr: NormalizedPullRequest,
  approveAt: string | null,
  isBotLogin: BotLoginMatcher,
): TimelineAuxiliary {
  const humanReactions = reactionTimestamps(pr, isBotLogin);
  // Fallback: merged PR with no human reactions → include bot reactions
  const reactions =
    humanReactions.length > 0 || pr.mergedAt === null
      ? humanReactions
      : reactionTimestamps(pr, neverBotLogin);

  const humanFirstReaction = findFirstReaction(pr, isBotLogin);
  // Fallback: merged PR with no human first reaction → include bots
  const firstReaction =
    humanFirstReaction ??
    (pr.mergedAt !== null ? findFirstReaction(pr, neverBotLogin) : null);
  const approveCount = pr.reviews.filter((r) => r.state === "APPROVED").length;
  const dismissCount = pr.reviews.filter((r) => r.state === "DISMISSED").length;
  const reviewCommentCount = reactions.length;
  const postApproveCommitCount =
    approveAt === null
      ? 0
      : pr.commits.filter((c) => c.authoredDate > approveAt).length;
  return {
    firstCommitAt: firstAuthoredDate(pr),
    readyForReviewAt: readyForReviewAt(pr),
    firstReaction,
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
  const humanReactionAt = findFirstReaction(pr, isBotLogin)?.at ?? null;
  // Fallback: merged PR with no human reactions → include bot reactions
  const reactionAt =
    humanReactionAt ??
    (pr.mergedAt !== null ? findFirstReaction(pr, neverBotLogin)?.at ?? null : null);

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
    auxiliary: computeAuxiliary(pr, approveAt, isBotLogin),
  };
}

function lastActivityKey(pr: NormalizedPullRequest): string {
  return pr.mergedAt ?? pr.closedAt ?? pr.createdAt;
}

export function selectTimelinePrs(
  prs: readonly NormalizedPullRequest[],
  weekEnd: string,
  limit?: number,
  isBotLogin: BotLoginMatcher = neverBotLogin,
): PrTimeline[] {
  const sorted = [...prs].sort((a, b) =>
    lastActivityKey(b).localeCompare(lastActivityKey(a)),
  );
  const selected = limit !== undefined ? sorted.slice(0, limit) : sorted;
  return selected.map((pr) => buildPrTimeline(pr, weekEnd, isBotLogin));
}
