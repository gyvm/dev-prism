import { createHash } from "node:crypto";

import type { NormalizedPullRequest } from "../shared/types.js";
import { requirePrId, stableHash } from "./identity.js";
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

function fallbackSubjectId(prefix: string, parts: readonly string[]): string {
  return `${prefix}:${stableHash(parts.join("|"))}`;
}

export function buildBodyRows(pullRequests: readonly NormalizedPullRequest[]): readonly DwhRow[] {
  const rows: DwhRow[] = [];

  for (const pr of pullRequests) {
    const prId = requirePrId(pr);
    addBody(rows, prId, "pr_body", prId, pr.bodyText ?? null, pr.updatedAt);

    pr.reviews.forEach((review, index) => {
      const reviewId = review.sourceNodeId ?? fallbackSubjectId("review", [prId, String(index), review.submittedAt ?? ""]);
      addBody(rows, reviewId, "review_body", review.sourceNodeId ?? null, review.bodyText ?? null, review.updatedAt ?? review.submittedAt);
    });

    pr.comments.forEach((comment, index) => {
      const commentId = comment.sourceNodeId ?? fallbackSubjectId("issue-comment", [prId, String(index), comment.createdAt]);
      addBody(rows, commentId, "issue_comment", comment.sourceNodeId ?? null, comment.bodyText, comment.updatedAt ?? comment.createdAt);
    });

    for (const thread of pr.reviewThreads) {
      thread.comments.forEach((comment, index) => {
        const commentId = comment.sourceNodeId ??
          fallbackSubjectId("review-comment", [prId, String(index), comment.createdAt, comment.path ?? ""]);
        addBody(
          rows,
          commentId,
          "review_comment",
          comment.sourceNodeId ?? null,
          comment.bodyText,
          comment.updatedAt ?? comment.createdAt,
        );
      });
    }
  }

  return rows;
}
