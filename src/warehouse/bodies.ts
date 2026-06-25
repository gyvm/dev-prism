import { createHash } from "node:crypto";

import type { NormalizedPullRequest } from "../shared/types.js";
import {
  issueCommentFallbackId,
  requirePrId,
  reviewCommentKey,
  reviewKey,
  reviewThreadKey,
} from "./identity.js";
import { isoToSqlTimestamp, type DwhRow } from "./rows.js";

function bodyHash(text: string | null): string | null {
  if (text === null) return null;
  return createHash("sha1").update(text).digest("hex");
}

function addBody(
  rows: DwhRow[],
  subjectId: string,
  subjectKind: string,
  sourceNodeId: string | null,
  text: string | null,
  updatedAt: string | null | undefined,
): void {
  if (text === null) return;
  rows.push({
    subject_id: subjectId,
    subject_kind: subjectKind,
    source_node_id: sourceNodeId,
    text,
    text_len: text.length,
    body_hash: bodyHash(text),
    updated_at: isoToSqlTimestamp(updatedAt),
  });
}

export function buildBodyRows(pullRequests: readonly NormalizedPullRequest[]): readonly DwhRow[] {
  const rows: DwhRow[] = [];

  for (const pr of pullRequests) {
    const prId = requirePrId(pr);
    addBody(rows, prId, "pr_body", prId, pr.bodyText ?? null, pr.updatedAt);

    pr.reviews.forEach((review, index) => {
      // Same id derivation as entities.ts (pr_reviews.review_id) so the bodies
      // purge can match this subject_id even when sourceNodeId is absent.
      const reviewId = reviewKey(review.sourceNodeId, prId, index, review.author, review.submittedAt);
      addBody(rows, reviewId, "review_body", review.sourceNodeId ?? null, review.bodyText ?? null, review.updatedAt ?? review.submittedAt);
    });

    pr.comments.forEach((comment, index) => {
      // Must match events.ts so the incremental bodies purge can reconstruct
      // this subject_id from the activities row via COALESCE(source_node_id, event_id).
      const commentId = comment.sourceNodeId ?? issueCommentFallbackId(prId, index, comment.createdAt);
      addBody(rows, commentId, "issue_comment", comment.sourceNodeId ?? null, comment.bodyText, comment.updatedAt ?? comment.createdAt);
    });

    pr.reviewThreads.forEach((thread, threadIndex) => {
      // threadId and commentId mirror entities.ts (pr_review_threads.thread_id /
      // pr_review_comments.comment_id) so the review_comment body purge matches.
      const threadId = reviewThreadKey(thread.sourceNodeId, prId, threadIndex, thread.path, thread.line);
      thread.comments.forEach((comment, commentIndex) => {
        const commentId = reviewCommentKey(comment.sourceNodeId, prId, threadId, commentIndex, comment.createdAt);
        addBody(
          rows,
          commentId,
          "review_comment",
          comment.sourceNodeId ?? null,
          comment.bodyText,
          comment.updatedAt ?? comment.createdAt,
        );
      });
    });
  }

  return rows;
}
