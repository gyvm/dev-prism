import { neverBotLogin, type BotLoginMatcher } from "../../../shared/bot.js";
import type { NormalizedPullRequest } from "../../../shared/types.js";

export type Reaction = Readonly<{ at: string; by: string }>;

export type ResolvedReactions = Readonly<{
  firstReaction: Reaction | null;
  reactions: readonly string[];
}>;

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

export function reactionTimestamps(
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

export function findFirstReaction(
  pr: NormalizedPullRequest,
  isBotLogin: BotLoginMatcher,
): Reaction | null {
  let best: Reaction | null = null;
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

// Merged PR with no human reaction → fall back to bot reactions so the
// timeline still attributes a reviewer event. For unmerged PRs, bot-only
// noise should not be promoted to "review activity".
export function resolveReactions(
  pr: NormalizedPullRequest,
  isBotLogin: BotLoginMatcher,
): ResolvedReactions {
  const humanReactions = reactionTimestamps(pr, isBotLogin);
  const humanFirst = findFirstReaction(pr, isBotLogin);

  const useBotFallback =
    humanReactions.length === 0 && pr.mergedAt !== null;

  if (!useBotFallback) {
    return { firstReaction: humanFirst, reactions: humanReactions };
  }
  return {
    firstReaction: findFirstReaction(pr, neverBotLogin),
    reactions: reactionTimestamps(pr, neverBotLogin),
  };
}
