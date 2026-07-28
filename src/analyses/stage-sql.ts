import type { Scope } from "./scope.js";

// Shared SQL fragments for every analysis that measures a PR's journey in stages:
// the cycle-time funnel (1-2), the lead-time trend (1-3), the per-PR stage table
// (3-2) and the size × review-pickup scatter (2-3, which reuses stage 2's clock).
// They all run the identical stage definitions — parity by shared module (design
// D4). It sits beside scope-sql.ts rather than under cycle-time/ because it is
// not that analysis's private detail: review-metrics depends on it too.
//
// Stage boundaries (fractional-hour diffs via epoch_ms, matching the DORA style):
//   1 commit→open    : min(pr_commits.authored_at|committed_at) → openStart
//   2 open→review    : openStart                                → first_review_at
//   3 review→approve : first_review_at                          → first_approve_at
//   4 approve→merge  : first_approve_at                         → merged_at
//
// `openStart` uses ready_for_review_at (the draft→ready moment) when present, else
// created_at — so a PR that spent time as a draft counts that delay as coding time
// and its pickup clock starts when it actually became reviewable. For a non-draft
// PR ready_for_review_at is null and this collapses to created_at.
export const OPEN_START = "COALESCE(pr.ready_for_review_at, pr.created_at)";

// First authoring time across a PR's commits. authored_at (the true authoring
// instant, which a rebase can move earlier) is preferred over committed_at.
export const FIRST_COMMIT_CTE = `first_commit AS (
      SELECT pr_id, min(COALESCE(authored_at, committed_at)) AS commit_at
      FROM pr_commits
      GROUP BY pr_id
    )`;

// Human-only recomputation of the precomputed first_review_at / first_approve_at
// columns. IMPORTANT parity invariant: entities.ts populates
//   first_review_at  = min(pr_reviews.submitted_at)
//   first_approve_at = min(pr_reviews.submitted_at) FILTER (state='APPROVED')
// so this CTE is definitionally the precomputed columns plus a `NOT is_bot`
// predicate — the two paths agree exactly when there are no bot reviews, which is
// what keeps includeBots=true (precomputed, fast) and includeBots=false (this CTE)
// consistent. If the precompute rule ever changes, update this in lockstep.
export const HUMAN_REVIEW_CTE = `human_review AS (
      SELECT rv.pr_id AS pr_id,
             min(rv.submitted_at) AS first_review_at,
             min(rv.submitted_at) FILTER (WHERE rv.state = 'APPROVED') AS first_approve_at
      FROM pr_reviews rv
      JOIN actors rvw ON rvw.actor_id = rv.author_actor_id
      WHERE rv.submitted_at IS NOT NULL AND NOT rvw.is_bot
      GROUP BY rv.pr_id
    )`;

export type ReviewExprs = Readonly<{
  /** SQL expression yielding the (possibly human-only) first review timestamp. */
  firstReview: string;
  /** SQL expression yielding the (possibly human-only) first approval timestamp. */
  firstApprove: string;
  /** Bare `human_review AS (…)` CTE body to include in WITH, or "" when bots included. */
  humanReviewCteBody: string;
  /** `LEFT JOIN human_review hr …`, or "" when bots included. */
  humanReviewJoin: string;
}>;

/**
 * Chooses between the precomputed pull_requests columns (bots included, no join)
 * and the human-only recompute CTE (bots excluded). See HUMAN_REVIEW_CTE for the
 * parity invariant that makes the two interchangeable at the bot boundary.
 */
export function reviewExprs(scope: Scope): ReviewExprs {
  if (scope.includeBots) {
    return {
      firstReview: "pr.first_review_at",
      firstApprove: "pr.first_approve_at",
      humanReviewCteBody: "",
      humanReviewJoin: "",
    };
  }
  return {
    firstReview: "hr.first_review_at",
    firstApprove: "hr.first_approve_at",
    humanReviewCteBody: HUMAN_REVIEW_CTE,
    humanReviewJoin: "LEFT JOIN human_review hr ON hr.pr_id = pr.pr_id",
  };
}

/** `WITH a, b, c` from CTE bodies, skipping empty ("") entries. */
export function withClause(...cteBodies: string[]): string {
  const parts = cteBodies.filter((body) => body.trim().length > 0);
  return `WITH ${parts.join(",\n    ")}`;
}

/** `(epoch_ms(end) - epoch_ms(start)) / 3600000.0` — fractional hours. */
export function hoursBetween(startExpr: string, endExpr: string): string {
  return `(epoch_ms(${endExpr}) - epoch_ms(${startExpr})) / 3600000.0`;
}
