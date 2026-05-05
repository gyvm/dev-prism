import { neverBotLogin, type BotLoginMatcher } from "../../../shared/bot.js";
import type {
  NormalizedPullRequest,
  ReviewCorrelation,
  ReviewerPair,
} from "../../../shared/types.js";

const PAIR_SEPARATOR = "\u0000";

export function computeReviewCorrelation(
  prs: readonly NormalizedPullRequest[],
  isBotLogin: BotLoginMatcher = neverBotLogin,
): ReviewCorrelation {
  const authorCounts = new Map<string, number>();
  const reviewerCounts = new Map<string, number>();
  const pairCounts = new Map<string, number>();

  for (const pr of prs) {
    if (pr.author) {
      authorCounts.set(pr.author, (authorCounts.get(pr.author) ?? 0) + 1);
    }

    const reviewersInPr = new Set<string>();
    for (const review of pr.reviews) {
      if (review.author === null) continue;
      if (review.author === pr.author) continue;
      reviewersInPr.add(review.author);
    }

    for (const reviewer of reviewersInPr) {
      reviewerCounts.set(reviewer, (reviewerCounts.get(reviewer) ?? 0) + 1);
      if (pr.author) {
        const key = `${pr.author}${PAIR_SEPARATOR}${reviewer}`;
        pairCounts.set(key, (pairCounts.get(key) ?? 0) + 1);
      }
    }
  }

  const authors = Array.from(authorCounts.entries())
    .map(([login, prCount]) => ({
      login,
      prCount,
      kind: isBotLogin(login) ? ("bot" as const) : ("human" as const),
    }))
    .sort((a, b) => b.prCount - a.prCount || a.login.localeCompare(b.login));

  const reviewers = Array.from(reviewerCounts.entries())
    .map(([login, reviewCount]) => ({
      login,
      reviewCount,
      kind: isBotLogin(login) ? ("bot" as const) : ("human" as const),
    }))
    .sort(
      (a, b) => b.reviewCount - a.reviewCount || a.login.localeCompare(b.login),
    );

  const pairs: ReviewerPair[] = Array.from(pairCounts.entries())
    .map(([key, count]) => {
      const [author, reviewer] = key.split(PAIR_SEPARATOR);
      return { author: author ?? "", reviewer: reviewer ?? "", count };
    })
    .sort((a, b) => b.count - a.count);

  return { authors, reviewers, pairs };
}
