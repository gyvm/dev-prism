import type { DwhQueryRunner } from "../../warehouse/query.js";
import type { Scope } from "../scope.js";
import { botFilter, inListFilter, timeRangeFilter } from "../scope-sql.js";
import { OPEN_START, hoursBetween, reviewExprs, withClause } from "../cycle-time/stage-sql.js";
import type {
  ReviewerLead,
  ReviewerLeadTimes,
  ReviewlessMerges,
  SizePickupPoint,
  SizePickupScatter,
} from "./view-model.js";

// SQL-native review metrics: review-less merges (2-1), size × review-pickup
// scatter (2-3), and reviewer-by-reviewer request→first-review time (2-5).
// Shared builders so Explore (WASM) and Reports (native) agree — design D4.

const DEFAULT_SCATTER_MAX_POINTS = 2000;

type ReviewlessRow = { merged_n: bigint | number; reviewless_n: bigint | number };
type ScatterRow = {
  number: bigint | number;
  title: string | null;
  url: string | null;
  repo_key: string;
  pickup_hours: number;
  size_lines: bigint | number;
  total_matched: bigint | number;
};
type ReviewerLeadRow = {
  reviewer: string;
  p50_hours: number | null;
  responded_n: bigint | number;
  pending_n: bigint | number;
};

// ── 2-1. Review-less merges ────────────────────────────────────────────────

/**
 * SQL for review-less merges (2-1): count of merged PRs in the window and how
 * many had zero reviews. With bots included the precomputed `first_review_at`
 * column is exactly `min(pr_reviews.submitted_at)`, so `IS NULL` is a
 * join-free "no review at all" test; with bots excluded a bot review must not
 * count, so it recomputes via NOT EXISTS over human reviewers.
 */
export function buildReviewlessMergesSql(scope: Scope): string {
  const repoFilter = inListFilter("r.repo_key", scope.repos);
  const mergedTime = timeRangeFilter("pr.merged_at", scope);
  const authorUsers = inListFilter("author.login", scope.users);
  const authorBots = botFilter("author.is_bot", scope);

  const reviewless = scope.includeBots
    ? "pr.first_review_at IS NULL"
    : `NOT EXISTS (
             SELECT 1 FROM pr_reviews rv
             JOIN actors rvw ON rvw.actor_id = rv.author_actor_id
             WHERE rv.pr_id = pr.pr_id AND rv.submitted_at IS NOT NULL AND NOT rvw.is_bot
           )`;

  return `
    SELECT count(*) AS merged_n,
           count(*) FILTER (WHERE ${reviewless}) AS reviewless_n
    FROM pull_requests pr
    JOIN repos r ON r.repo_id = pr.repo_id
    LEFT JOIN actors author ON author.actor_id = pr.author_actor_id
    WHERE pr.merged_at IS NOT NULL${repoFilter}${mergedTime}${authorUsers}${authorBots}
  `;
}

export async function queryReviewlessMerges(
  runner: DwhQueryRunner,
  scope: Scope,
): Promise<ReviewlessMerges> {
  const rows = await runner.all<ReviewlessRow>(buildReviewlessMergesSql(scope));
  const row = rows[0] ?? { merged_n: 0, reviewless_n: 0 };
  const mergedCount = Number(row.merged_n);
  const reviewlessCount = Number(row.reviewless_n);

  return {
    mergedCount,
    reviewlessCount,
    rate: mergedCount === 0 ? null : reviewlessCount / mergedCount,
  };
}

// ── 2-3. Size × review-pickup scatter ──────────────────────────────────────

/**
 * SQL for the size × review-pickup scatter (2-3): one row per merged PR with a
 * (non-null, non-negative) pickup time. PRs never reviewed have no X position
 * and are excluded — their count lives in 2-1. `count(*) OVER ()` returns the
 * pre-cap total so the UI can annotate "showing N of M"; the cap keeps WASM
 * rendering bounded, selecting the most recent PRs (ORDER BY merged_at DESC).
 */
export function buildSizePickupScatterSql(scope: Scope): string {
  const repoFilter = inListFilter("r.repo_key", scope.repos);
  const mergedTime = timeRangeFilter("pr.merged_at", scope);
  const authorUsers = inListFilter("author.login", scope.users);
  const authorBots = botFilter("author.is_bot", scope);
  const ex = reviewExprs(scope);
  const pickup = hoursBetween(OPEN_START, ex.firstReview);
  const limit = Math.max(
    1,
    Math.floor(scope.thresholds.scatterMaxPoints ?? DEFAULT_SCATTER_MAX_POINTS),
  );

  return `
    ${withClause(
      ex.humanReviewCteBody,
      `scatter AS (
      SELECT pr.number AS number, pr.title AS title, pr.url AS url, r.repo_key AS repo_key,
             ${pickup} AS pickup_hours,
             COALESCE(pr.additions, 0) + COALESCE(pr.deletions, 0) AS size_lines,
             pr.merged_at AS merged_at
      FROM pull_requests pr
      JOIN repos r ON r.repo_id = pr.repo_id
      LEFT JOIN actors author ON author.actor_id = pr.author_actor_id
      ${ex.humanReviewJoin}
      WHERE pr.merged_at IS NOT NULL${repoFilter}${mergedTime}${authorUsers}${authorBots}
        AND ${ex.firstReview} IS NOT NULL
        AND ${pickup} >= 0
    )`,
    )}
    SELECT number, title, url, repo_key, pickup_hours, size_lines,
           count(*) OVER () AS total_matched
    FROM scatter
    ORDER BY merged_at DESC
    LIMIT ${limit}
  `;
}

export async function querySizePickupScatter(
  runner: DwhQueryRunner,
  scope: Scope,
): Promise<SizePickupScatter> {
  const rows = await runner.all<ScatterRow>(buildSizePickupScatterSql(scope));
  const totalMatched = rows.length === 0 ? 0 : Number(rows[0]!.total_matched);

  const points: SizePickupPoint[] = rows.map((row) => ({
    number: Number(row.number),
    title: row.title,
    url: row.url,
    repoKey: row.repo_key,
    pickupHours: row.pickup_hours,
    sizeLines: Number(row.size_lines),
  }));

  return { points, totalMatched, truncated: totalMatched > points.length };
}

// ── 2-5. Reviewer-by-reviewer request→first-review time ─────────────────────

/**
 * SQL for reviewer lead times (2-5): pairs each reviewer's first request on a PR
 * (`activities.review_requested`, target_actor_id) with their first review
 * submitted after that request. The representative value is the median
 * (outlier-resistant vs. the mean); unanswered requests are kept as `pending_n`
 * (censored), not folded into the median. Self-initiated reviews (no request)
 * never appear because they have no matching request row.
 */
export function buildReviewerLeadSql(scope: Scope): string {
  const repoFilter = inListFilter("r.repo_key", scope.repos);
  const reqTime = timeRangeFilter("a.occurred_at", scope);
  const reviewerBots = botFilter("rvw.is_bot", scope);
  const reviewerUsers = inListFilter("rvw.login", scope.users);

  return `
    WITH requests AS (
      SELECT a.pr_id AS pr_id, a.target_actor_id AS reviewer_id, min(a.occurred_at) AS requested_at
      FROM activities a
      JOIN repos r ON r.repo_id = a.repo_id
      WHERE a.event_type = 'review_requested' AND a.target_actor_id IS NOT NULL${repoFilter}${reqTime}
      GROUP BY a.pr_id, a.target_actor_id
    ),
    submits AS (
      SELECT a.pr_id AS pr_id, a.actor_id AS reviewer_id, a.occurred_at AS submitted_at
      FROM activities a
      WHERE a.event_type = 'review_submitted' AND a.actor_id IS NOT NULL
    ),
    first_response AS (
      SELECT req.reviewer_id AS reviewer_id, req.pr_id AS pr_id, req.requested_at AS requested_at,
             min(s.submitted_at) AS responded_at
      FROM requests req
      LEFT JOIN submits s
        ON s.pr_id = req.pr_id AND s.reviewer_id = req.reviewer_id AND s.submitted_at >= req.requested_at
      GROUP BY req.reviewer_id, req.pr_id, req.requested_at
    )
    SELECT rvw.login AS reviewer,
           median(${hoursBetween("requested_at", "responded_at")})
             FILTER (WHERE responded_at IS NOT NULL) AS p50_hours,
           count(*) FILTER (WHERE responded_at IS NOT NULL) AS responded_n,
           count(*) FILTER (WHERE responded_at IS NULL) AS pending_n
    FROM first_response fr
    JOIN actors rvw ON rvw.actor_id = fr.reviewer_id
    WHERE rvw.login IS NOT NULL${reviewerBots}${reviewerUsers}
    GROUP BY rvw.login
    ORDER BY p50_hours DESC NULLS LAST, reviewer ASC
  `;
}

export async function queryReviewerLead(
  runner: DwhQueryRunner,
  scope: Scope,
): Promise<ReviewerLeadTimes> {
  const rows = await runner.all<ReviewerLeadRow>(buildReviewerLeadSql(scope));

  const reviewers: ReviewerLead[] = rows.map((row) => ({
    reviewer: row.reviewer,
    p50Hours: row.p50_hours,
    respondedCount: Number(row.responded_n),
    pendingCount: Number(row.pending_n),
  }));

  return { reviewers };
}
