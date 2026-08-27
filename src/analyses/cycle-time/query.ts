import type { DwhQueryRunner } from "../../warehouse/runner.js";
import type { Scope } from "../scope.js";
import { inListFilter, botFilter, timeRangeFilter } from "../scope-sql.js";
import {
  FIRST_COMMIT_CTE,
  OPEN_START,
  hoursBetween,
  reviewExprs,
  withClause,
} from "../stage-sql.js";
import type {
  CycleFunnel,
  CycleFunnelStage,
  LeadTrend,
  LeadTrendBucket,
  PrStageTimes,
} from "./view-model.js";
import { CYCLE_STAGE_KEYS } from "./view-model.js";

// SQL-native cycle-time funnel (1-2), lead-time trend (1-3) and per-PR stage
// table (3-2). All three share the same four stage definitions from stage-sql.ts,
// so the Explore views compute identical numbers — parity by shared module
// (design D4) — and the funnel can never disagree with the table
// the funnel drills down into.
//
// Negative stage durations (e.g. a rebase that moves the first commit after PR
// creation) are excluded per stage via `FILTER (WHERE sN >= 0)`: they are a small
// data-quality artefact and clipping them to 0 would bias the median downward.

type FunnelRow = {
  stage: bigint | number;
  stage_key: string;
  p50_hours: number | null;
  n: bigint | number;
};

type StageTimesRow = {
  number: bigint | number;
  title: string | null;
  url: string | null;
  repo_key: string;
  size_lines: bigint | number;
  s1: number | null;
  s2: number | null;
  s3: number | null;
  s4: number | null;
  merged_at_text: string;
};

type TrendRow = {
  bucket_text: string;
  s1_p50: number | null;
  s1_n: bigint | number;
  s2_p50: number | null;
  s2_n: bigint | number;
  s3_p50: number | null;
  s3_n: bigint | number;
  s4_p50: number | null;
  s4_n: bigint | number;
};

function toIso(bucketText: string): string {
  return new Date(`${bucketText.replace(" ", "T")}Z`).toISOString();
}

/** The four `sN` stage expressions, given the review timestamp expressions. */
function stageExprs(firstReview: string, firstApprove: string): [string, string, string, string] {
  return [
    hoursBetween("fc.commit_at", OPEN_START),
    hoursBetween(OPEN_START, firstReview),
    hoursBetween(firstReview, firstApprove),
    hoursBetween(firstApprove, "pr.merged_at"),
  ];
}

/**
 * SQL for the cycle-time funnel (1-2): one row per stage with the p50 hours and
 * the per-stage sample size `n`.
 */
export function buildCycleFunnelSql(scope: Scope): string {
  const repoFilter = inListFilter("r.repo_key", scope.repos);
  const mergedTime = timeRangeFilter("pr.merged_at", scope);
  const authorUsers = inListFilter("author.login", scope.users);
  const authorBots = botFilter("author.is_bot", scope);
  const ex = reviewExprs(scope);
  const [s1, s2, s3, s4] = stageExprs(ex.firstReview, ex.firstApprove);

  return `
    ${withClause(FIRST_COMMIT_CTE, ex.humanReviewCteBody)}
    , staged AS (
      SELECT
        ${s1} AS s1,
        ${s2} AS s2,
        ${s3} AS s3,
        ${s4} AS s4
      FROM pull_requests pr
      JOIN repos r ON r.repo_id = pr.repo_id
      LEFT JOIN actors author ON author.actor_id = pr.author_actor_id
      LEFT JOIN first_commit fc ON fc.pr_id = pr.pr_id
      ${ex.humanReviewJoin}
      WHERE pr.merged_at IS NOT NULL${repoFilter}${mergedTime}${authorUsers}${authorBots}
    )
    SELECT 1 AS stage, 'commit_to_open' AS stage_key,
           median(s1) FILTER (WHERE s1 >= 0) AS p50_hours, count(s1) FILTER (WHERE s1 >= 0) AS n FROM staged
    UNION ALL SELECT 2, 'open_to_review',
           median(s2) FILTER (WHERE s2 >= 0), count(s2) FILTER (WHERE s2 >= 0) FROM staged
    UNION ALL SELECT 3, 'review_to_approve',
           median(s3) FILTER (WHERE s3 >= 0), count(s3) FILTER (WHERE s3 >= 0) FROM staged
    UNION ALL SELECT 4, 'approve_to_merge',
           median(s4) FILTER (WHERE s4 >= 0), count(s4) FILTER (WHERE s4 >= 0) FROM staged
    ORDER BY stage
  `;
}

/**
 * SQL for the lead-time trend (1-3): the same four stages' p50 hours (+ n) per
 * `date_trunc(grain, merged_at)` bucket. The grain is whitelisted in
 * resolveScope, so it is safe to inline into date_trunc.
 */
export function buildLeadTrendSql(scope: Scope): string {
  const repoFilter = inListFilter("r.repo_key", scope.repos);
  const mergedTime = timeRangeFilter("pr.merged_at", scope);
  const authorUsers = inListFilter("author.login", scope.users);
  const authorBots = botFilter("author.is_bot", scope);
  const ex = reviewExprs(scope);
  const [s1, s2, s3, s4] = stageExprs(ex.firstReview, ex.firstApprove);

  return `
    ${withClause(FIRST_COMMIT_CTE, ex.humanReviewCteBody)}
    , staged AS (
      SELECT CAST(date_trunc('${scope.grain}', pr.merged_at) AS VARCHAR) AS bucket_text,
             ${s1} AS s1,
             ${s2} AS s2,
             ${s3} AS s3,
             ${s4} AS s4
      FROM pull_requests pr
      JOIN repos r ON r.repo_id = pr.repo_id
      LEFT JOIN actors author ON author.actor_id = pr.author_actor_id
      LEFT JOIN first_commit fc ON fc.pr_id = pr.pr_id
      ${ex.humanReviewJoin}
      WHERE pr.merged_at IS NOT NULL${repoFilter}${mergedTime}${authorUsers}${authorBots}
    )
    SELECT bucket_text,
           median(s1) FILTER (WHERE s1 >= 0) AS s1_p50, count(s1) FILTER (WHERE s1 >= 0) AS s1_n,
           median(s2) FILTER (WHERE s2 >= 0) AS s2_p50, count(s2) FILTER (WHERE s2 >= 0) AS s2_n,
           median(s3) FILTER (WHERE s3 >= 0) AS s3_p50, count(s3) FILTER (WHERE s3 >= 0) AS s3_n,
           median(s4) FILTER (WHERE s4 >= 0) AS s4_p50, count(s4) FILTER (WHERE s4 >= 0) AS s4_n
    FROM staged
    GROUP BY bucket_text
    ORDER BY bucket_text
  `;
}

export async function queryCycleFunnel(runner: DwhQueryRunner, scope: Scope): Promise<CycleFunnel> {
  const rows = await runner.all<FunnelRow>(buildCycleFunnelSql(scope));
  const byStage = new Map(rows.map((row) => [Number(row.stage), row]));

  const stages: CycleFunnelStage[] = CYCLE_STAGE_KEYS.map((key, index) => {
    const row = byStage.get(index + 1);
    return {
      stage: index + 1,
      key,
      p50Hours: row?.p50_hours ?? null,
      n: row ? Number(row.n) : 0,
    };
  });

  return { stages };
}

/**
 * SQL for the per-PR stage table (3-2): one row per merged PR with each stage's
 * duration, the same data the gantt (3-1) shows as bands. It reuses `stageExprs`
 * — the funnel's own expressions — so a stage that reads "slow" in 1-2 lands on
 * the same numbers when the funnel card drills down into this table.
 *
 * Negative durations are nulled *per cell* rather than dropping the row: the
 * funnel's `FILTER (WHERE sN >= 0)` means "keep this artefact out of that stage's
 * median", and the per-row equivalent is an empty cell — the PR's other three
 * stages are still real data. There is deliberately no LIMIT: unlike the scatter
 * (2-3), a table has no rendering cliff and `StageTimeTable` has no truncation
 * affordance, so a silent cap would hide rows with no way to say so.
 */
export function buildPrStageTimesSql(scope: Scope): string {
  const repoFilter = inListFilter("r.repo_key", scope.repos);
  const mergedTime = timeRangeFilter("pr.merged_at", scope);
  const authorUsers = inListFilter("author.login", scope.users);
  const authorBots = botFilter("author.is_bot", scope);
  const ex = reviewExprs(scope);
  const [s1, s2, s3, s4] = stageExprs(ex.firstReview, ex.firstApprove);

  return `
    ${withClause(FIRST_COMMIT_CTE, ex.humanReviewCteBody)}
    , staged AS (
      SELECT pr.number AS number, pr.title AS title, pr.url AS url, r.repo_key AS repo_key,
             COALESCE(pr.additions, 0) + COALESCE(pr.deletions, 0) AS size_lines,
             ${s1} AS s1,
             ${s2} AS s2,
             ${s3} AS s3,
             ${s4} AS s4,
             pr.merged_at AS merged_at
      FROM pull_requests pr
      JOIN repos r ON r.repo_id = pr.repo_id
      LEFT JOIN actors author ON author.actor_id = pr.author_actor_id
      LEFT JOIN first_commit fc ON fc.pr_id = pr.pr_id
      ${ex.humanReviewJoin}
      WHERE pr.merged_at IS NOT NULL${repoFilter}${mergedTime}${authorUsers}${authorBots}
    )
    SELECT number, title, url, repo_key, size_lines,
           CASE WHEN s1 >= 0 THEN s1 END AS s1,
           CASE WHEN s2 >= 0 THEN s2 END AS s2,
           CASE WHEN s3 >= 0 THEN s3 END AS s3,
           CASE WHEN s4 >= 0 THEN s4 END AS s4,
           CAST(merged_at AS VARCHAR) AS merged_at_text
    FROM staged
    ORDER BY merged_at DESC, number DESC
  `;
}

export async function queryLeadTrend(runner: DwhQueryRunner, scope: Scope): Promise<LeadTrend> {
  const rows = await runner.all<TrendRow>(buildLeadTrendSql(scope));

  const buckets: LeadTrendBucket[] = rows.map((row) => ({
    bucket: toIso(row.bucket_text),
    stages: [
      { p50Hours: row.s1_p50, n: Number(row.s1_n) },
      { p50Hours: row.s2_p50, n: Number(row.s2_n) },
      { p50Hours: row.s3_p50, n: Number(row.s3_n) },
      { p50Hours: row.s4_p50, n: Number(row.s4_n) },
    ],
  }));

  return { grain: scope.grain, buckets };
}

export async function queryPrStageTimes(
  runner: DwhQueryRunner,
  scope: Scope,
): Promise<readonly PrStageTimes[]> {
  const rows = await runner.all<StageTimesRow>(buildPrStageTimesSql(scope));

  return rows.map((row) => ({
    number: Number(row.number),
    title: row.title,
    url: row.url,
    repoKey: row.repo_key,
    sizeLines: Number(row.size_lines),
    stageHours: [row.s1, row.s2, row.s3, row.s4],
    mergedAt: toIso(row.merged_at_text),
  }));
}
