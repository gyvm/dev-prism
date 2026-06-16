import type { BotLoginMatcher } from "../../shared/bot.js";
import type { NormalizedPullRequest, ReviewState } from "../../shared/types.js";
import type { DwhQueryRunner } from "../../warehouse/query.js";
import type { Scope } from "../scope.js";
import { inListFilter, timeRangeFilter } from "../scope-sql.js";
import { selectTimelinePrs } from "./internal/timeline.js";
import type { PrTimelineOutput } from "./compute.js";

// PR timeline is a state machine that is awkward in SQL (design D2/D6), so we
// thin-pull only the rows for the PRs in scope and reconstruct a partial
// NormalizedPullRequest, then reuse the existing timeline TS unchanged.
//
// Thinness relies on the same updated_at semantics as the incremental cursor:
// any in-window activity bumps a PR's updated_at, so `updated_at >= from` is a
// safe superset of the active PRs (selectTimelinePrs applies the exact window).

function sqlList(values: readonly string[]): string {
  return values.map((value) => `'${value.replaceAll("'", "''")}'`).join(", ");
}

function toIso(text: string | null): string | null {
  if (text === null) return null;
  const date = new Date(`${text.replace(" ", "T")}Z`);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

type PrRow = {
  pr_id: string; repo_id: string; owner: string; name: string; visibility: string | null;
  number: number; title: string | null; author: string | null;
  created_at: string; merged_at: string | null; closed_at: string | null; is_draft: boolean | null;
};
type ReviewRow = { pr_id: string; state: string | null; submitted_at: string | null; author: string | null };
type ActorTimeRow = { pr_id: string; at: string; author: string | null };
type CommitRow = { pr_id: string; oid: string; committed_at: string; authored_at: string | null };
type ReadyRow = { pr_id: string; at: string };

function groupBy<T, K extends string>(rows: readonly T[], key: (row: T) => K): Map<K, T[]> {
  const map = new Map<K, T[]>();
  for (const row of rows) {
    const k = key(row);
    (map.get(k) ?? map.set(k, []).get(k)!).push(row);
  }
  return map;
}

async function botLoginMatcher(runner: DwhQueryRunner): Promise<BotLoginMatcher> {
  const rows = await runner.all<{ login: string }>(
    "SELECT login FROM actors WHERE is_bot AND login IS NOT NULL",
  );
  const bots = new Set(rows.map((row) => row.login));
  return (login: string) => bots.has(login);
}

export async function queryPrTimeline(
  runner: DwhQueryRunner,
  scope: Scope,
): Promise<PrTimelineOutput> {
  if (scope.to === null) {
    throw new Error("pr-timeline query requires scope.to (the timeline endpoint)");
  }
  const from = scope.from ?? new Date(0);
  const to = scope.to;

  const repoFilter = inListFilter("r.repo_key", scope.repos);
  const candidateTime = timeRangeFilter("pr.updated_at", { ...scope, to: null }); // lower bound only
  const userFilter = inListFilter("author.login", scope.users);

  const prRows = await runner.all<PrRow>(`
    SELECT pr.pr_id AS pr_id, pr.repo_id AS repo_id, r.owner AS owner, r.name AS name, r.visibility AS visibility,
           pr.number AS number, pr.title AS title, author.login AS author,
           CAST(pr.created_at AS VARCHAR) AS created_at,
           CAST(pr.merged_at AS VARCHAR) AS merged_at,
           CAST(pr.closed_at AS VARCHAR) AS closed_at,
           pr.is_draft AS is_draft
    FROM pull_requests pr
    JOIN repos r ON r.repo_id = pr.repo_id
    LEFT JOIN actors author ON author.actor_id = pr.author_actor_id
    WHERE TRUE${repoFilter}${candidateTime}${userFilter}
  `);

  if (prRows.length === 0) {
    return { weekStart: from.toISOString(), weekEnd: to.toISOString(), timezone: "UTC", timelines: [] };
  }

  const ids = sqlList(prRows.map((row) => row.pr_id));
  const [reviews, comments, reviewComments, commits, readyEvents, isBotLogin] = await Promise.all([
    runner.all<ReviewRow>(`
      SELECT rv.pr_id AS pr_id, rv.state AS state, CAST(rv.submitted_at AS VARCHAR) AS submitted_at, a.login AS author
      FROM pr_reviews rv LEFT JOIN actors a ON a.actor_id = rv.author_actor_id
      WHERE rv.pr_id IN (${ids})`),
    runner.all<ActorTimeRow>(`
      SELECT act.pr_id AS pr_id, CAST(act.occurred_at AS VARCHAR) AS at, a.login AS author
      FROM activities act LEFT JOIN actors a ON a.actor_id = act.actor_id
      WHERE act.event_type = 'comment_created' AND act.pr_id IN (${ids})`),
    runner.all<ActorTimeRow>(`
      SELECT c.pr_id AS pr_id, CAST(c.created_at AS VARCHAR) AS at, a.login AS author
      FROM pr_review_comments c LEFT JOIN actors a ON a.actor_id = c.author_actor_id
      WHERE c.pr_id IN (${ids})`),
    runner.all<CommitRow>(`
      SELECT pr_id, oid, CAST(committed_at AS VARCHAR) AS committed_at, CAST(authored_at AS VARCHAR) AS authored_at
      FROM pr_commits WHERE pr_id IN (${ids})`),
    runner.all<ReadyRow>(`
      SELECT pr_id, CAST(occurred_at AS VARCHAR) AS at
      FROM activities WHERE event_type = 'pr_ready_for_review' AND pr_id IN (${ids})`),
    botLoginMatcher(runner),
  ]);

  const reviewsByPr = groupBy(reviews, (r) => r.pr_id);
  const commentsByPr = groupBy(comments, (r) => r.pr_id);
  const reviewCommentsByPr = groupBy(reviewComments, (r) => r.pr_id);
  const commitsByPr = groupBy(commits, (r) => r.pr_id);
  const readyByPr = groupBy(readyEvents, (r) => r.pr_id);

  const reconstructed: NormalizedPullRequest[] = prRows.map((pr) => ({
    repo: { owner: pr.owner, name: pr.name, sourceNodeId: pr.repo_id, visibility: pr.visibility },
    sourceNodeId: pr.pr_id,
    number: pr.number,
    title: pr.title ?? "",
    author: pr.author,
    createdAt: toIso(pr.created_at) ?? new Date(0).toISOString(),
    updatedAt: toIso(pr.created_at) ?? new Date(0).toISOString(),
    mergedAt: toIso(pr.merged_at),
    closedAt: toIso(pr.closed_at),
    additions: 0,
    deletions: 0,
    labels: [],
    reviews: (reviewsByPr.get(pr.pr_id) ?? []).map((row) => ({
      author: row.author,
      state: row.state as ReviewState | null,
      submittedAt: toIso(row.submitted_at),
    })),
    reviewRequests: [],
    isDraft: pr.is_draft ?? false,
    timelineEvents: (readyByPr.get(pr.pr_id) ?? []).map((row) => ({
      type: "ready_for_review" as const,
      createdAt: toIso(row.at) ?? new Date(0).toISOString(),
    })),
    comments: (commentsByPr.get(pr.pr_id) ?? []).map((row) => ({
      author: row.author,
      bodyText: "",
      createdAt: toIso(row.at) ?? new Date(0).toISOString(),
      updatedAt: null,
      url: null,
    })),
    // All review comments collapsed into one synthetic thread: the timeline
    // reaction logic iterates thread comments and is agnostic to grouping.
    reviewThreads: [
      {
        isResolved: null,
        isOutdated: null,
        path: null,
        line: null,
        startLine: null,
        comments: (reviewCommentsByPr.get(pr.pr_id) ?? []).map((row) => ({
          author: row.author,
          bodyText: "",
          createdAt: toIso(row.at) ?? new Date(0).toISOString(),
          updatedAt: null,
          url: null,
          path: null,
          line: null,
        })),
      },
    ],
    commits: (commitsByPr.get(pr.pr_id) ?? []).map((row) => ({
      oid: row.oid,
      committedDate: toIso(row.committed_at) ?? new Date(0).toISOString(),
      authoredDate: toIso(row.authored_at) ?? toIso(row.committed_at) ?? new Date(0).toISOString(),
      messageHeadline: "",
      author: null,
    })),
  }));

  const timelines = selectTimelinePrs(reconstructed, from, to, undefined, isBotLogin);
  return { weekStart: from.toISOString(), weekEnd: to.toISOString(), timezone: "UTC", timelines };
}
