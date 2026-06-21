import type { DwhQueryRunner } from "../../warehouse/query.js";
import type { Scope } from "../scope.js";
import { scopeTimestamp } from "../scope.js";
import { botFilter, inListFilter } from "../scope-sql.js";
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

type SummaryPrRow = {
  pr_id: string;
  repo: string;
  number: number;
  title: string | null;
  url: string | null;
  author: string | null;
  created_at: string;
  updated_at: string;
  merged_at: string | null;
  closed_at: string | null;
  additions: bigint | number | null;
  deletions: bigint | number | null;
  first_review_at: string | null;
  conversation_count: bigint | number;
  unresolved_thread_count: bigint | number;
  participant_count: bigint | number;
};

type SummaryPr = Readonly<{
  repo: string;
  number: number;
  title: string;
  url: string | null;
  author: string | null;
  createdAt: string;
  updatedAt: string;
  mergedAt: string | null;
  closedAt: string | null;
  additions: number;
  deletions: number;
  firstReviewAt: string | null;
  conversationCount: number;
  unresolvedThreadCount: number;
  participantCount: number;
}>;

function sqlString(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function toIso(text: string | null): string | null {
  if (text === null) return null;
  const date = new Date(`${text.replace(" ", "T")}Z`);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function diffHours(from: string, to: string): number {
  return (new Date(to).getTime() - new Date(from).getTime()) / 3_600_000;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid] ?? null;
  const a = sorted[mid - 1];
  const b = sorted[mid];
  return a === undefined || b === undefined ? null : (a + b) / 2;
}

function average(values: readonly number[]): number | null {
  return values.length === 0 ? null : values.reduce((sum, value) => sum + value, 0) / values.length;
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

function previousScope(scope: Scope): Scope | null {
  if (scope.from === null || scope.to === null) return null;
  const durationMs = scope.to.getTime() - scope.from.getTime();
  const to = new Date(scope.from.getTime() - 1);
  const from = new Date(to.getTime() - durationMs);
  return { ...scope, from, to };
}

function activeWindowFilter(scope: Scope): string {
  const parts: string[] = [];
  const columns = ["pr.created_at", "pr.updated_at", "pr.merged_at"];
  for (const column of columns) {
    const bounds: string[] = [];
    if (scope.from) bounds.push(`${column} >= TIMESTAMP ${sqlString(scopeTimestamp(scope.from))}`);
    if (scope.to) bounds.push(`${column} <= TIMESTAMP ${sqlString(scopeTimestamp(scope.to))}`);
    if (bounds.length > 0) parts.push(`(${column} IS NOT NULL AND ${bounds.join(" AND ")})`);
  }
  return parts.length === 0 ? "" : ` AND (${parts.join(" OR ")})`;
}

function candidate(pr: SummaryPr, metric: string): DevPrismPrCandidate {
  return {
    repo: pr.repo,
    number: pr.number,
    title: pr.title,
    url: pr.url,
    author: pr.author,
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

function normalize(row: SummaryPrRow): SummaryPr {
  return {
    repo: row.repo,
    number: row.number,
    title: row.title ?? "",
    url: row.url,
    author: row.author,
    createdAt: toIso(row.created_at) ?? new Date(0).toISOString(),
    updatedAt: toIso(row.updated_at) ?? new Date(0).toISOString(),
    mergedAt: toIso(row.merged_at),
    closedAt: toIso(row.closed_at),
    additions: Number(row.additions ?? 0),
    deletions: Number(row.deletions ?? 0),
    firstReviewAt: toIso(row.first_review_at),
    conversationCount: Number(row.conversation_count),
    unresolvedThreadCount: Number(row.unresolved_thread_count),
    participantCount: Number(row.participant_count),
  };
}

async function fetchPrRows(
  runner: DwhQueryRunner,
  scope: Scope,
): Promise<SummaryPr[]> {
  const repoFilter = inListFilter("r.repo_key", scope.repos);
  const userFilter = inListFilter("author.login", scope.users);
  const activeFilter = activeWindowFilter(scope);

  const rows = await runner.all<SummaryPrRow>(`
    WITH review_body_counts AS (
      SELECT pr_id, count(*) AS count
      FROM pr_reviews
      WHERE submitted_at IS NOT NULL
      GROUP BY pr_id
    ),
    pr_comment_counts AS (
      SELECT pr_id, count(*) AS count
      FROM activities
      WHERE event_type = 'comment_created'
      GROUP BY pr_id
    ),
    review_comment_counts AS (
      SELECT pr_id, count(*) AS count
      FROM pr_review_comments
      GROUP BY pr_id
    ),
    unresolved_threads AS (
      SELECT pr_id, count(*) AS count
      FROM pr_review_threads
      WHERE is_resolved = false
      GROUP BY pr_id
    ),
    raw_participants AS (
      SELECT pr_id, actor_id
      FROM (
        SELECT pr_id, author_actor_id AS actor_id FROM pr_reviews WHERE author_actor_id IS NOT NULL
        UNION ALL
        SELECT pr_id, actor_id FROM activities WHERE event_type = 'comment_created' AND actor_id IS NOT NULL
        UNION ALL
        SELECT pr_id, author_actor_id AS actor_id FROM pr_review_comments WHERE author_actor_id IS NOT NULL
      ) p
    ),
    participants AS (
      SELECT p.pr_id AS pr_id,
             count(DISTINCT p.actor_id) FILTER (WHERE p.actor_id IS DISTINCT FROM pr.author_actor_id) AS count
      FROM raw_participants p
      JOIN pull_requests pr ON pr.pr_id = p.pr_id
      GROUP BY p.pr_id
    )
    SELECT pr.pr_id AS pr_id,
           r.repo_key AS repo,
           pr.number AS number,
           pr.title AS title,
           pr.url AS url,
           author.login AS author,
           CAST(pr.created_at AS VARCHAR) AS created_at,
           CAST(pr.updated_at AS VARCHAR) AS updated_at,
           CAST(pr.merged_at AS VARCHAR) AS merged_at,
           CAST(pr.closed_at AS VARCHAR) AS closed_at,
           pr.additions AS additions,
           pr.deletions AS deletions,
           CAST(pr.first_review_at AS VARCHAR) AS first_review_at,
           COALESCE(rbc.count, 0) + COALESCE(pcc.count, 0) + COALESCE(rcc.count, 0) AS conversation_count,
           COALESCE(ut.count, 0) AS unresolved_thread_count,
           COALESCE(participants.count, 0) AS participant_count
    FROM pull_requests pr
    JOIN repos r ON r.repo_id = pr.repo_id
    LEFT JOIN actors author ON author.actor_id = pr.author_actor_id
    LEFT JOIN review_body_counts rbc ON rbc.pr_id = pr.pr_id
    LEFT JOIN pr_comment_counts pcc ON pcc.pr_id = pr.pr_id
    LEFT JOIN review_comment_counts rcc ON rcc.pr_id = pr.pr_id
    LEFT JOIN unresolved_threads ut ON ut.pr_id = pr.pr_id
    LEFT JOIN participants ON participants.pr_id = pr.pr_id
    WHERE TRUE${repoFilter}${userFilter}${botFilter("pr.is_bot_author", scope)}${activeFilter}
  `);

  return rows.map(normalize);
}

export async function queryDevPrismSummary(
  runner: DwhQueryRunner,
  scope: Scope,
): Promise<DevPrismSummary> {
  const to = scope.to ?? new Date();
  const previous = previousScope(scope);
  const [activePrs, previousActivePrs] = await Promise.all([
    fetchPrRows(runner, scope),
    previous ? fetchPrRows(runner, previous) : Promise.resolve([]),
  ]);
  const mergedPrs = activePrs.filter((pr) => pr.mergedAt !== null);
  const previousMergedPrs = previousActivePrs.filter((pr) => pr.mergedAt !== null);
  const leadTimeFor = (pr: SummaryPr): number | null =>
    pr.mergedAt === null ? null : diffHours(pr.createdAt, pr.mergedAt);
  const reviewWaitFor = (pr: SummaryPr): number | null => {
    if (pr.firstReviewAt !== null) return diffHours(pr.createdAt, pr.firstReviewAt);
    if (pr.mergedAt !== null) return null;
    return diffHours(pr.createdAt, to.toISOString());
  };
  const leadTimeHours = median(
    mergedPrs.map(leadTimeFor).filter((value): value is number => value !== null),
  );
  const averageReviewWaitHours = average(
    activePrs.map(reviewWaitFor).filter((value): value is number => value !== null),
  );
  const previousLeadTimeHours = median(
    previousMergedPrs
      .map(leadTimeFor)
      .filter((value): value is number => value !== null),
  );
  const previousTo = previous?.to ?? new Date(0);
  const previousReviewWaitFor = (pr: SummaryPr): number | null => {
    if (pr.firstReviewAt !== null) return diffHours(pr.createdAt, pr.firstReviewAt);
    if (pr.mergedAt !== null) return null;
    return diffHours(pr.createdAt, previousTo.toISOString());
  };
  const previousAverageReviewWaitHours = average(
    previousActivePrs
      .map(previousReviewWaitFor)
      .filter((value): value is number => value !== null),
  );
  const leadTimeDeltaHours =
    leadTimeHours === null || previousLeadTimeHours === null
      ? null
      : leadTimeHours - previousLeadTimeHours;
  const reviewWaitDeltaHours =
    averageReviewWaitHours === null || previousAverageReviewWaitHours === null
      ? null
      : averageReviewWaitHours - previousAverageReviewWaitHours;
  const mergedPrDelta = mergedPrs.length - previousMergedPrs.length;

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
      analystComment: analystComment(
        leadTimeHours,
        leadTimeDeltaHours,
        averageReviewWaitHours,
        mergedPrs.length,
        activePrs.length,
      ),
    },
    whatChanged: {
      longLeadTimePrs: topBy(
        mergedPrs.filter((pr) => {
          const lead = leadTimeFor(pr);
          return lead !== null && lead >= LONG_LEAD_TIME_MIN_HOURS;
        }),
        leadTimeFor,
      ).map((pr) => candidate(pr, formatHours(leadTimeFor(pr)))),
      longReviewWaitPrs: topBy(
        activePrs.filter((pr) => {
          const wait = reviewWaitFor(pr);
          return wait !== null && wait >= LONG_REVIEW_WAIT_MIN_HOURS;
        }),
        reviewWaitFor,
      ).map((pr) => candidate(pr, formatHours(reviewWaitFor(pr)))),
      largePrs: topBy(
        activePrs.filter((pr) => pr.additions + pr.deletions >= LARGE_PR_MIN_LINES),
        (pr) => pr.additions + pr.deletions,
      ).map((pr) => candidate(pr, `${pr.additions + pr.deletions}行`)),
      debatedPrs: topBy(
        activePrs.filter((pr) => pr.conversationCount > 0),
        (pr) => pr.conversationCount,
      ).map((pr) => candidate(pr, `${pr.conversationCount}件の会話`)),
    },
    rememberThisWeek: {
      quickWins: mergedPrs
        .filter((pr) => {
          const lead = leadTimeFor(pr);
          return lead !== null && lead <= QUICK_WIN_MAX_HOURS && pr.additions + pr.deletions <= QUICK_WIN_MAX_LINES;
        })
        .sort((a, b) => (leadTimeFor(a) ?? 0) - (leadTimeFor(b) ?? 0))
        .slice(0, MAX_CANDIDATES)
        .map((pr) => candidate(pr, formatHours(leadTimeFor(pr)))),
      smallButUseful: mergedPrs
        .filter((pr) => pr.additions + pr.deletions <= SMALL_PR_MAX_LINES)
        .sort((a, b) => (a.additions + a.deletions) - (b.additions + b.deletions))
        .slice(0, MAX_CANDIDATES)
        .map((pr) => candidate(pr, `${pr.additions + pr.deletions}行`)),
      collaborativePrs: topBy(
        activePrs.filter((pr) => pr.participantCount > 0),
        (pr) => pr.participantCount,
      ).map((pr) => candidate(pr, `${pr.participantCount}人が参加`)),
    },
    needsFollowUp: {
      staleOpenPrs: activePrs
        .filter((pr) => pr.mergedAt === null && pr.closedAt === null)
        .filter((pr) => diffHours(pr.createdAt, to.toISOString()) >= STALE_OPEN_HOURS)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
        .slice(0, MAX_CANDIDATES)
        .map((pr) =>
          candidate(pr, formatHours(diffHours(pr.createdAt, to.toISOString()))),
        ),
      unresolvedReviewPrs: activePrs
        .filter((pr) => pr.unresolvedThreadCount > 0)
        .slice(0, MAX_CANDIDATES)
        .map((pr) => candidate(pr, `${pr.unresolvedThreadCount}件未解決`)),
      waitingAfterCommentPrs: activePrs
        .filter((pr) => pr.mergedAt === null && pr.closedAt === null)
        .map((pr) => ({ pr, idleHours: diffHours(pr.updatedAt, to.toISOString()) }))
        .filter((entry) => entry.idleHours >= WAITING_AFTER_COMMENT_HOURS)
        .sort((a, b) => b.idleHours - a.idleHours)
        .slice(0, MAX_CANDIDATES)
        .map(({ pr, idleHours }) => candidate(pr, `${formatHours(idleHours)}停止`)),
    },
  };
}
