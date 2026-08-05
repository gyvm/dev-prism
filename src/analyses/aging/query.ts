import type { DwhQueryRunner } from "../../warehouse/runner.js";
import type { Scope } from "../scope.js";
import { scopeTimestamp } from "../scope.js";
import { botFilter, inListFilter } from "../scope-sql.js";
import type {
  AgingHistogram,
  AgingHistogramBucket,
  AgingPr,
  AgingStatus,
  AgingSummary,
  AgingTable,
} from "./view-model.js";
import { AGING_HISTOGRAM_BUCKETS } from "./view-model.js";

// SQL-native aging page (4-1 summary / 4-2 table / 4-3 histogram) over the open
// PR snapshot. These deliberately ignore the time-range filter (a backlog is
// "as of now", not "in the window") but apply repo/user/bot filters. "Now" is
// injected as a `TIMESTAMP '…'` literal (`nowTs`) resolved in the wrapper, so the
// builders stay pure and deterministic — the codebase avoids non-deterministic
// now() in SQL. Shared builders keep Explore and Reports in parity (design D4).

// Latest review state per PR (the review with the greatest submitted_at) plus
// that timestamp, used to detect "changes requested" and whether a newer commit
// has since reset the ball to the reviewers.
const LATEST_REVIEW_CTE = `latest_review AS (
      SELECT pr_id,
             arg_max(state, submitted_at) AS state,
             max(submitted_at) AS submitted_at
      FROM pr_reviews
      WHERE submitted_at IS NOT NULL
      GROUP BY pr_id
    )`;

const LAST_COMMIT_CTE = `last_commit AS (
      SELECT pr_id, max(committed_at) AS at
      FROM pr_commits
      GROUP BY pr_id
    )`;

// Ball holder = the current requested reviewers (open review-request snapshot).
const BALL_HOLDERS_CTE = `ball_holders AS (
      SELECT rr.pr_id AS pr_id,
             string_agg(DISTINCT rvw.login, ', ' ORDER BY rvw.login) AS holders
      FROM pr_review_requests rr
      JOIN actors rvw ON rvw.actor_id = rr.requested_actor_id
      WHERE rvw.login IS NOT NULL
      GROUP BY rr.pr_id
    )`;

// True exactly for the "awaiting_review" state (the CASE ELSE branch). A PR is
// awaiting review when it is not a draft, not yet approved, and not in an
// unaddressed changes-requested state. A commit newer than the changes-requested
// review flips the ball back to the reviewers → awaiting_review again.
const AWAITING_REVIEW = `NOT coalesce(pr.is_draft, false)
        AND pr.first_approve_at IS NULL
        AND NOT coalesce(lr.state = 'CHANGES_REQUESTED' AND (lc.at IS NULL OR lc.at <= lr.submitted_at), false)`;

const STATUS_CASE = `CASE
             WHEN coalesce(pr.is_draft, false) THEN 'draft'
             WHEN pr.first_approve_at IS NOT NULL THEN 'approved'
             WHEN coalesce(lr.state = 'CHANGES_REQUESTED' AND (lc.at IS NULL OR lc.at <= lr.submitted_at), false)
               THEN 'changes_requested'
             ELSE 'awaiting_review'
           END`;

type SummaryRow = {
  open_n: bigint | number;
  awaiting_review_n: bigint | number;
  oldest_age_days: number | null;
};
type AgingRow = {
  number: bigint | number;
  title: string | null;
  url: string | null;
  repo_key: string;
  author: string | null;
  status: AgingStatus;
  ball_holder: string | null;
  age_hours: number;
  created_at: string;
  updated_at: string;
};
type HistogramRow = { bucket: string; n: bigint | number };

function toIso(text: string): string {
  return new Date(`${text.replace(" ", "T")}Z`).toISOString();
}

/** Common open-PR filter (no time range; the backlog is "as of now"). */
function openFilters(scope: Scope): string {
  const repoFilter = inListFilter("r.repo_key", scope.repos);
  const userFilter = inListFilter("author.login", scope.users);
  const authorBots = botFilter("pr.is_bot_author", scope);
  return `${repoFilter}${userFilter}${authorBots}`;
}

/** `TIMESTAMP '…'` literal for the reference "now" (scope.to, else the supplied now). */
function agingNowTs(scope: Scope, now: Date): string {
  return `TIMESTAMP '${scopeTimestamp(scope.to ?? now)}'`;
}

// ── 4-2. Aging table ────────────────────────────────────────────────────────

function buildAgingTableSql(scope: Scope, nowTs: string): string {
  return `
    WITH ${LATEST_REVIEW_CTE},
    ${LAST_COMMIT_CTE},
    ${BALL_HOLDERS_CTE}
    SELECT pr.number AS number, pr.title AS title, pr.url AS url, r.repo_key AS repo_key,
           author.login AS author,
           (epoch_ms(${nowTs}) - epoch_ms(pr.created_at)) / 3600000.0 AS age_hours,
           CAST(pr.created_at AS VARCHAR) AS created_at,
           CAST(pr.updated_at AS VARCHAR) AS updated_at,
           ${STATUS_CASE} AS status,
           CASE WHEN ${AWAITING_REVIEW} THEN bh.holders ELSE author.login END AS ball_holder
    FROM pull_requests pr
    JOIN repos r ON r.repo_id = pr.repo_id
    LEFT JOIN actors author ON author.actor_id = pr.author_actor_id
    LEFT JOIN latest_review lr ON lr.pr_id = pr.pr_id
    LEFT JOIN last_commit lc ON lc.pr_id = pr.pr_id
    LEFT JOIN ball_holders bh ON bh.pr_id = pr.pr_id
    WHERE pr.merged_at IS NULL AND pr.closed_at IS NULL${openFilters(scope)}
    ORDER BY age_hours DESC
  `;
}

export async function queryAgingTable(
  runner: DwhQueryRunner,
  scope: Scope,
  now: Date,
): Promise<AgingTable> {
  const rows = await runner.all<AgingRow>(buildAgingTableSql(scope, agingNowTs(scope, now)));

  const prs: AgingPr[] = rows.map((row) => ({
    number: Number(row.number),
    title: row.title,
    url: row.url,
    repoKey: row.repo_key,
    author: row.author,
    status: row.status,
    ballHolder: row.ball_holder,
    ageHours: row.age_hours,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  }));

  return { prs };
}

// ── 4-1. Aging summary ──────────────────────────────────────────────────────

function buildAgingSummarySql(scope: Scope, nowTs: string): string {
  return `
    WITH ${LATEST_REVIEW_CTE},
    ${LAST_COMMIT_CTE},
    open_prs AS (
      -- AWAITING_REVIEW is evaluated here, where the pr/lr/lc aliases it names
      -- are in scope, so 4-1's count and 4-2's 'awaiting_review' status can
      -- never drift apart the way two copies of the predicate would.
      SELECT ${AWAITING_REVIEW} AS awaiting_review,
             (epoch_ms(${nowTs}) - epoch_ms(pr.created_at)) / 3600000.0 AS age_hours
      FROM pull_requests pr
      JOIN repos r ON r.repo_id = pr.repo_id
      LEFT JOIN actors author ON author.actor_id = pr.author_actor_id
      LEFT JOIN latest_review lr ON lr.pr_id = pr.pr_id
      LEFT JOIN last_commit lc ON lc.pr_id = pr.pr_id
      WHERE pr.merged_at IS NULL AND pr.closed_at IS NULL${openFilters(scope)}
    )
    SELECT count(*) AS open_n,
           count(*) FILTER (WHERE awaiting_review) AS awaiting_review_n,
           max(age_hours) / 24.0 AS oldest_age_days
    FROM open_prs
  `;
}

export async function queryAgingSummary(
  runner: DwhQueryRunner,
  scope: Scope,
  now: Date,
): Promise<AgingSummary> {
  const rows = await runner.all<SummaryRow>(buildAgingSummarySql(scope, agingNowTs(scope, now)));
  const row = rows[0] ?? { open_n: 0, awaiting_review_n: 0, oldest_age_days: null };

  return {
    openCount: Number(row.open_n),
    awaitingReviewCount: Number(row.awaiting_review_n),
    oldestAgeDays: row.oldest_age_days,
  };
}

// ── 4-3. Age histogram ──────────────────────────────────────────────────────

function buildAgingHistogramSql(scope: Scope, nowTs: string): string {
  return `
    SELECT bucket, count(*) AS n
    FROM (
      SELECT CASE
               WHEN age_h < 24 THEN '<1d'
               WHEN age_h < 72 THEN '1-3d'
               WHEN age_h < 168 THEN '3-7d'
               WHEN age_h < 336 THEN '7-14d'
               ELSE '14d+'
             END AS bucket
      FROM (
        SELECT (epoch_ms(${nowTs}) - epoch_ms(pr.created_at)) / 3600000.0 AS age_h
        FROM pull_requests pr
        JOIN repos r ON r.repo_id = pr.repo_id
        LEFT JOIN actors author ON author.actor_id = pr.author_actor_id
        WHERE pr.merged_at IS NULL AND pr.closed_at IS NULL${openFilters(scope)}
      ) ages
    ) bucketed
    GROUP BY bucket
  `;
}

export async function queryAgingHistogram(
  runner: DwhQueryRunner,
  scope: Scope,
  now: Date,
): Promise<AgingHistogram> {
  const rows = await runner.all<HistogramRow>(buildAgingHistogramSql(scope, agingNowTs(scope, now)));
  const counts = new Map(rows.map((row) => [row.bucket, Number(row.n)]));

  const buckets: AgingHistogramBucket[] = AGING_HISTOGRAM_BUCKETS.map((bucket) => ({
    bucket,
    count: counts.get(bucket) ?? 0,
  }));

  return { buckets };
}
