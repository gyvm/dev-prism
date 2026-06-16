import type { NormalizedActor, NormalizedPullRequest } from "../shared/types.js";
import { actorId, actorType, requirePrId, requireRepoId, stableHash } from "./identity.js";
import { isoToSqlTimestamp, type DwhRow } from "./rows.js";

export type ActivityRows = Readonly<{
  activities: readonly DwhRow[];
  activity_actors: readonly DwhRow[];
}>;

function addActivityActor(
  rows: DwhRow[],
  eventId: string,
  actor: NormalizedActor | null | undefined,
  role: string,
): void {
  rows.push({
    event_id: eventId,
    actor_id: actorId(actor),
    role,
    actor_type: actorType(actor),
  });
}

function attributes(value: Record<string, unknown> | null): string | null {
  return value === null ? null : JSON.stringify(value);
}

function syntheticEventId(eventType: string, prId: string): string {
  return `pr:${eventType}:${prId}`;
}

function fallbackEventId(parts: readonly string[]): string {
  return `event:${stableHash(parts.join("|"))}`;
}

export function buildActivityRows(pullRequests: readonly NormalizedPullRequest[]): ActivityRows {
  const activities: DwhRow[] = [];
  const activityActors: DwhRow[] = [];

  const addActivity = (row: DwhRow): void => {
    activities.push({
      source_node_id: null,
      actor_id: null,
      target_actor_id: null,
      target_actor_type: null,
      review_state: null,
      path: null,
      line: null,
      value_num: 1,
      attributes: null,
      ...row,
    });
  };

  for (const pr of pullRequests) {
    const repoId = requireRepoId(pr);
    const prId = requirePrId(pr);

    const openedEventId = syntheticEventId("pr_opened", prId);
    addActivity({
      event_id: openedEventId,
      event_type: "pr_opened",
      occurred_at: isoToSqlTimestamp(pr.createdAt),
      repo_id: repoId,
      pr_id: prId,
      actor_id: actorId(pr.authorActor),
      attributes: attributes({ is_draft: pr.isDraft }),
    });
    addActivityActor(activityActors, openedEventId, pr.authorActor, "author");

    for (const timelineEvent of pr.timelineEvents) {
      if (timelineEvent.type === "ready_for_review") {
        const eventId = timelineEvent.sourceNodeId ?? fallbackEventId([prId, "ready", timelineEvent.createdAt]);
        addActivity({
          event_id: eventId,
          source_node_id: timelineEvent.sourceNodeId ?? null,
          event_type: "pr_ready_for_review",
          occurred_at: isoToSqlTimestamp(timelineEvent.createdAt),
          repo_id: repoId,
          pr_id: prId,
          actor_id: actorId(timelineEvent.actor),
        });
        addActivityActor(activityActors, eventId, timelineEvent.actor, "actor");
      } else {
        const eventId = timelineEvent.sourceNodeId ?? fallbackEventId([prId, "review-requested", timelineEvent.createdAt]);
        addActivity({
          event_id: eventId,
          source_node_id: timelineEvent.sourceNodeId ?? null,
          event_type: "review_requested",
          occurred_at: isoToSqlTimestamp(timelineEvent.createdAt),
          repo_id: repoId,
          pr_id: prId,
          actor_id: actorId(timelineEvent.actor),
          target_actor_id: actorId(timelineEvent.requestedReviewerActor),
          target_actor_type: actorType(timelineEvent.requestedReviewerActor),
        });
        addActivityActor(activityActors, eventId, timelineEvent.actor, "actor");
        addActivityActor(activityActors, eventId, timelineEvent.requestedReviewerActor, "requested_reviewer");
      }
    }

    pr.reviews.forEach((review, index) => {
      if (!review.submittedAt) return;
      const eventId = review.sourceNodeId ?? fallbackEventId([prId, "review", String(index), review.submittedAt]);
      addActivity({
        event_id: eventId,
        source_node_id: review.sourceNodeId ?? null,
        event_type: "review_submitted",
        occurred_at: isoToSqlTimestamp(review.submittedAt),
        repo_id: repoId,
        pr_id: prId,
        actor_id: actorId(review.authorActor),
        review_state: review.state,
      });
      addActivityActor(activityActors, eventId, review.authorActor, "reviewer");
    });

    pr.comments.forEach((comment, index) => {
      const eventId = comment.sourceNodeId ?? fallbackEventId([prId, "issue-comment", String(index), comment.createdAt]);
      addActivity({
        event_id: eventId,
        source_node_id: comment.sourceNodeId ?? null,
        event_type: "comment_created",
        occurred_at: isoToSqlTimestamp(comment.createdAt),
        repo_id: repoId,
        pr_id: prId,
        actor_id: actorId(comment.authorActor),
      });
      addActivityActor(activityActors, eventId, comment.authorActor, "author");
    });

    for (const thread of pr.reviewThreads) {
      for (const comment of thread.comments) {
        const eventId = comment.sourceNodeId ?? fallbackEventId([prId, "review-comment", comment.createdAt, comment.path ?? ""]);
        addActivity({
          event_id: eventId,
          source_node_id: comment.sourceNodeId ?? null,
          event_type: "review_comment_created",
          occurred_at: isoToSqlTimestamp(comment.createdAt),
          repo_id: repoId,
          pr_id: prId,
          actor_id: actorId(comment.authorActor),
          path: comment.path ?? thread.path ?? null,
          line: comment.line ?? thread.line ?? null,
        });
        addActivityActor(activityActors, eventId, comment.authorActor, "author");
      }
    }

    for (const commit of pr.commits) {
      const eventId = `commit:${prId}:${commit.oid}`;
      addActivity({
        event_id: eventId,
        event_type: "commit_pushed",
        occurred_at: isoToSqlTimestamp(commit.committedDate),
        repo_id: repoId,
        pr_id: prId,
        actor_id: actorId(commit.authorActor),
        attributes: attributes({ oid: commit.oid }),
      });
      addActivityActor(activityActors, eventId, commit.authorActor, "author");
    }

    if (pr.mergedAt) {
      const eventId = syntheticEventId("pr_merged", prId);
      addActivity({
        event_id: eventId,
        event_type: "pr_merged",
        occurred_at: isoToSqlTimestamp(pr.mergedAt),
        repo_id: repoId,
        pr_id: prId,
        actor_id: actorId(pr.mergedByActor) ?? actorId(pr.authorActor),
        attributes: attributes({ merged_by_actor_id: actorId(pr.mergedByActor) }),
      });
      addActivityActor(activityActors, eventId, pr.mergedByActor ?? pr.authorActor, "merged_by");
    } else if (pr.closedAt) {
      const eventId = syntheticEventId("pr_closed", prId);
      addActivity({
        event_id: eventId,
        event_type: "pr_closed",
        occurred_at: isoToSqlTimestamp(pr.closedAt),
        repo_id: repoId,
        pr_id: prId,
        actor_id: actorId(pr.authorActor),
      });
      addActivityActor(activityActors, eventId, pr.authorActor, "author");
    }
  }

  return { activities, activity_actors: activityActors };
}
