import type { ReviewCorrelation, ReviewerPair } from "../../shared/types.js";
import type { DwhQueryRunner } from "../../warehouse/query.js";
import type { Scope } from "../scope.js";
import { botFilter, eitherInListFilter, inListFilter, timeRangeFilter } from "../scope-sql.js";

// SQL-native review correlation. Produces the same view-model
// (`ReviewCorrelation`, login-keyed) the bipartite-graph renderer already eats,
// so the renderer is unchanged. `kind` reads the build-time `actors.is_bot`
// flag instead of recomputing the bot match at query time (design D5).
//
// Note: PRs whose author has no resolved actor id are excluded (correlation is
// defined over author×reviewer). `scope.users` spans both axes — authors are
// filtered by login; reviewer/pair rows match when the author OR the reviewer
// is in `users` (design B: both-axis semantics).

type AuthorRow = { login: string; pr_count: bigint | number; is_bot: boolean };
type ReviewerRow = { login: string; review_count: bigint | number; is_bot: boolean };
type PairRow = { author: string; reviewer: string; cnt: bigint | number };

function kindOf(isBot: boolean): "bot" | "human" {
  return isBot ? "bot" : "human";
}

/**
 * SQL for review correlation (authors / reviewers / pairs). Exported so
 * DuckDB-WASM (Explore) and DuckDB-native (Reports) run identical queries —
 * parity by shared module (design D4).
 */
export function buildReviewCorrelationSql(
  scope: Scope,
): Readonly<{ authors: string; reviewers: string; pairs: string }> {
  const repoFilter = inListFilter("r.repo_key", scope.repos);
  const prTime = timeRangeFilter("pr.created_at", scope);
  const reviewTime = timeRangeFilter("rv.submitted_at", scope);
  const authorUsers = inListFilter("a.login", scope.users);

  const authors = `
    SELECT a.login AS login, count(*) AS pr_count, a.is_bot AS is_bot
    FROM pull_requests pr
    JOIN actors a ON a.actor_id = pr.author_actor_id
    JOIN repos r ON r.repo_id = pr.repo_id
    WHERE a.login IS NOT NULL${botFilter("a.is_bot", scope)}${repoFilter}${prTime}${authorUsers}
    GROUP BY a.login, a.is_bot
    ORDER BY pr_count DESC, login ASC
  `;

  // Distinct (pr, author, reviewer) excluding self-review, keyed by login.
  const pairsCte = `
    WITH review_pairs AS (
      SELECT DISTINCT pr.pr_id AS pr_id, author.login AS author, reviewer.login AS reviewer,
             reviewer.is_bot AS reviewer_is_bot
      FROM pr_reviews rv
      JOIN pull_requests pr ON pr.pr_id = rv.pr_id
      JOIN repos r ON r.repo_id = pr.repo_id
      JOIN actors author ON author.actor_id = pr.author_actor_id
      JOIN actors reviewer ON reviewer.actor_id = rv.author_actor_id
      WHERE reviewer.login IS NOT NULL
        AND author.login IS NOT NULL
        AND reviewer.login <> author.login${botFilter("reviewer.is_bot", scope)}${repoFilter}${reviewTime}${eitherInListFilter("author.login", "reviewer.login", scope.users)}
    )`;

  const reviewers = `
    ${pairsCte}
    SELECT reviewer AS login, count(DISTINCT pr_id) AS review_count, bool_or(reviewer_is_bot) AS is_bot
    FROM review_pairs
    GROUP BY reviewer
    ORDER BY review_count DESC, login ASC
  `;

  const pairs = `
    ${pairsCte}
    SELECT author, reviewer, count(*) AS cnt
    FROM review_pairs
    GROUP BY author, reviewer
    ORDER BY cnt DESC, author ASC, reviewer ASC
  `;

  return { authors, reviewers, pairs };
}

export async function queryReviewCorrelation(
  runner: DwhQueryRunner,
  scope: Scope,
): Promise<ReviewCorrelation> {
  const sql = buildReviewCorrelationSql(scope);
  const authorRows = await runner.all<AuthorRow>(sql.authors);
  const reviewerRows = await runner.all<ReviewerRow>(sql.reviewers);
  const pairRows = await runner.all<PairRow>(sql.pairs);

  const pairs: ReviewerPair[] = pairRows.map((row) => ({
    author: row.author,
    reviewer: row.reviewer,
    count: Number(row.cnt),
  }));

  return {
    authors: authorRows.map((row) => ({
      login: row.login,
      prCount: Number(row.pr_count),
      kind: kindOf(row.is_bot),
    })),
    reviewers: reviewerRows.map((row) => ({
      login: row.login,
      reviewCount: Number(row.review_count),
      kind: kindOf(row.is_bot),
    })),
    pairs,
  };
}
