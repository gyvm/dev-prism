import type { BotLoginMatcher } from "../shared/bot.js";
import type { NormalizedActor, NormalizedPullRequest } from "../shared/types.js";
import { actorDisplayKey, actorId, prKey, requirePrId, requireRepoId, stableHash } from "./identity.js";
import { isoToSqlTimestamp, type DwhRow } from "./rows.js";

export type EntityRows = Readonly<{
  repos: readonly DwhRow[];
  actors: readonly DwhRow[];
  pull_requests: readonly DwhRow[];
  pr_reviews: readonly DwhRow[];
  pr_review_requests: readonly DwhRow[];
  pr_review_threads: readonly DwhRow[];
  pr_review_comments: readonly DwhRow[];
  pr_commits: readonly DwhRow[];
  pr_files: readonly DwhRow[];
  pr_labels: readonly DwhRow[];
}>;

function compareIso(a: string | null | undefined, b: string | null | undefined): number {
  if (!a && !b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  return new Date(a).getTime() - new Date(b).getTime();
}

function firstTimestamp(values: readonly (string | null | undefined)[]): string | null {
  const sorted = values
    .filter((value): value is string => typeof value === "string" && !Number.isNaN(new Date(value).getTime()))
    .sort(compareIso);
  return sorted[0] ?? null;
}

function fallbackId(prefix: string, parts: readonly DwhRow[string][]): string {
  return `${prefix}:${stableHash(parts.map((part) => part ?? "").join("|"))}`;
}

function idOrFallback(id: string | null | undefined, prefix: string, parts: readonly DwhRow[string][]): string {
  return typeof id === "string" && id.length > 0 ? id : fallbackId(prefix, parts);
}

function addActor(
  actorsById: Map<string, DwhRow>,
  actor: NormalizedActor | null | undefined,
  isBotLogin: BotLoginMatcher,
): string | null {
  const id = actorId(actor);
  if (!actor || !id) return null;
  const login = actor.login ?? null;
  actorsById.set(id, {
    actor_id: id,
    actor_type: actor.type ?? "Unknown",
    login,
    slug: actor.slug ?? null,
    display_name: actor.name ?? login ?? actor.slug ?? null,
    url: actor.url ?? null,
    is_bot: actor.type === "Bot" || (login !== null && isBotLogin(login)),
    team: null,
  });
  return id;
}

export function buildEntityRows(
  pullRequests: readonly NormalizedPullRequest[],
  isBotLogin: BotLoginMatcher,
): EntityRows {
  const reposById = new Map<string, DwhRow>();
  const actorsById = new Map<string, DwhRow>();
  const pullRequestRows: DwhRow[] = [];
  const reviewRows: DwhRow[] = [];
  const reviewRequestRows: DwhRow[] = [];
  const reviewThreadRows: DwhRow[] = [];
  const reviewCommentRows: DwhRow[] = [];
  const commitRows: DwhRow[] = [];
  const fileRows: DwhRow[] = [];
  const labelRows: DwhRow[] = [];

  for (const pr of pullRequests) {
    const repoId = requireRepoId(pr);
    const prId = requirePrId(pr);
    const authorActorId = addActor(actorsById, pr.authorActor, isBotLogin);
    const mergedByActorId = addActor(actorsById, pr.mergedByActor, isBotLogin);

    reposById.set(repoId, {
      repo_id: repoId,
      repo_key: `${pr.repo.owner}/${pr.repo.name}`,
      owner: pr.repo.owner,
      name: pr.repo.name,
      visibility: pr.repo.visibility ?? null,
    });

    const readyForReviewAt = firstTimestamp(
      pr.timelineEvents
        .filter((event) => event.type === "ready_for_review")
        .map((event) => event.createdAt),
    );
    const firstReviewAt = firstTimestamp(pr.reviews.map((review) => review.submittedAt));
    const firstApproveAt = firstTimestamp(
      pr.reviews
        .filter((review) => review.state === "APPROVED")
        .map((review) => review.submittedAt),
    );

    pullRequestRows.push({
      pr_id: prId,
      pr_key: prKey(pr),
      source_node_id: prId,
      repo_id: repoId,
      number: pr.number,
      title: pr.title,
      url: pr.url ?? null,
      author_actor_id: authorActorId,
      merged_by_actor_id: mergedByActorId,
      is_bot_author: pr.authorActor?.type === "Bot" || (pr.author !== null && isBotLogin(pr.author)),
      state: pr.state ?? null,
      is_draft: pr.isDraft,
      created_at: isoToSqlTimestamp(pr.createdAt),
      updated_at: isoToSqlTimestamp(pr.updatedAt),
      ready_for_review_at: isoToSqlTimestamp(readyForReviewAt),
      first_review_at: isoToSqlTimestamp(firstReviewAt),
      first_approve_at: isoToSqlTimestamp(firstApproveAt),
      merged_at: isoToSqlTimestamp(pr.mergedAt),
      closed_at: isoToSqlTimestamp(pr.closedAt),
      additions: pr.additions,
      deletions: pr.deletions,
      changed_files: pr.changedFiles ?? pr.files?.length ?? null,
    });

    pr.reviews.forEach((review, index) => {
      const reviewId = idOrFallback(review.sourceNodeId, "review", [prId, index, review.author, review.submittedAt]);
      reviewRows.push({
        review_id: reviewId,
        source_node_id: reviewId,
        pr_id: prId,
        author_actor_id: addActor(actorsById, review.authorActor, isBotLogin),
        state: review.state ?? "UNKNOWN",
        submitted_at: isoToSqlTimestamp(review.submittedAt),
        updated_at: isoToSqlTimestamp(review.updatedAt ?? review.submittedAt ?? pr.updatedAt),
        commit_oid: review.commitOid ?? null,
        url: review.url ?? null,
      });
    });

    pr.reviewRequests.forEach((request, index) => {
      const actor = request.requestedReviewerActor ?? null;
      const requestId = idOrFallback(request.sourceNodeId, "review-request", [prId, index, request.requestedReviewer]);
      reviewRequestRows.push({
        request_id: requestId,
        source_node_id: request.sourceNodeId ?? null,
        pr_id: prId,
        requested_actor_id: addActor(actorsById, actor, isBotLogin),
        requested_actor_type: actor?.type ?? "Unknown",
        as_code_owner: request.asCodeOwner ?? null,
        requested_reviewer_key: request.requestedReviewer ?? (actor ? actorDisplayKey(actor) : null),
      });
    });

    for (const timelineEvent of pr.timelineEvents) {
      addActor(actorsById, timelineEvent.actor, isBotLogin);
      addActor(actorsById, timelineEvent.requestedReviewerActor, isBotLogin);
    }

    for (const comment of pr.comments) {
      addActor(actorsById, comment.authorActor, isBotLogin);
    }

    pr.reviewThreads.forEach((thread, threadIndex) => {
      const threadId = idOrFallback(thread.sourceNodeId, "review-thread", [prId, threadIndex, thread.path, thread.line]);
      reviewThreadRows.push({
        thread_id: threadId,
        source_node_id: threadId,
        pr_id: prId,
        path: thread.path ?? "",
        line: thread.line ?? null,
        start_line: thread.startLine ?? null,
        subject_type: thread.subjectType ?? null,
        is_resolved: thread.isResolved ?? null,
        is_outdated: thread.isOutdated ?? null,
        resolved_by_actor_id: addActor(actorsById, thread.resolvedByActor, isBotLogin),
      });

      thread.comments.forEach((comment, commentIndex) => {
        const commentId = idOrFallback(comment.sourceNodeId, "review-comment", [
          prId,
          threadId,
          commentIndex,
          comment.createdAt,
        ]);
        reviewCommentRows.push({
          comment_id: commentId,
          source_node_id: commentId,
          pr_id: prId,
          thread_id: threadId,
          review_id: comment.reviewSourceNodeId ?? null,
          author_actor_id: addActor(actorsById, comment.authorActor, isBotLogin),
          created_at: isoToSqlTimestamp(comment.createdAt),
          updated_at: isoToSqlTimestamp(comment.updatedAt ?? comment.createdAt),
          path: comment.path ?? thread.path ?? "",
          line: comment.line ?? thread.line ?? null,
          start_line: comment.startLine ?? null,
          original_line: comment.originalLine ?? null,
          state: comment.state ?? null,
          is_outdated: comment.isOutdated ?? null,
          url: comment.url ?? null,
        });
      });
    });

    pr.commits.forEach((commit) => {
      commitRows.push({
        pr_id: prId,
        oid: commit.oid,
        committed_at: isoToSqlTimestamp(commit.committedDate),
        authored_at: isoToSqlTimestamp(commit.authoredDate),
        author_actor_id: addActor(actorsById, commit.authorActor, isBotLogin),
        author_name: commit.authorName ?? commit.author ?? null,
        author_email: commit.authorEmail ?? null,
        message_headline_len: commit.messageHeadline.length,
      });
    });

    for (const file of pr.files ?? []) {
      fileRows.push({
        pr_id: prId,
        path: file.path,
        additions: file.additions,
        deletions: file.deletions,
        change_type: file.changeType,
      });
    }

    for (const label of pr.labels) {
      labelRows.push({
        pr_id: prId,
        label: label.name,
      });
    }
  }

  return {
    repos: [...reposById.values()],
    actors: [...actorsById.values()],
    pull_requests: pullRequestRows,
    pr_reviews: reviewRows,
    pr_review_requests: reviewRequestRows,
    pr_review_threads: reviewThreadRows,
    pr_review_comments: reviewCommentRows,
    pr_commits: commitRows,
    pr_files: fileRows,
    pr_labels: labelRows,
  };
}
