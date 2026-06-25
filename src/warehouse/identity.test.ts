import { describe, expect, it } from "vitest";

import { makePr } from "../test-fixtures.js";
import { neverBotLogin } from "../shared/bot.js";
import { buildEntityRows } from "./entities.js";
import { buildBodyRows } from "./bodies.js";
import { reviewCommentKey, reviewKey, reviewThreadKey } from "./identity.js";

// Regression guard for the bodies-purge idempotency contract: the synthetic id
// of a review / review-comment derived by the entity tables MUST equal the
// `bodies.subject_id` written for the same row, even when the row has no GitHub
// Node.id. Otherwise build.ts can never match the old body row and stale bodies
// survive re-fetch (the same class of bug `issueCommentFallbackId` fixed for
// issue comments). buildEntityRows and buildBodyRows must agree by construction.
describe("warehouse identity parity (no Node.id)", () => {
  const pr = makePr({
    sourceNodeId: "PR_node_1",
    repo: { owner: "acme", name: "app", sourceNodeId: "REPO_node_1" },
    reviews: [
      {
        // No sourceNodeId → falls back to reviewKey(...)
        author: "bob",
        state: "COMMENTED",
        submittedAt: "2026-05-01T10:00:00.000Z",
        bodyText: "please tweak this",
      },
    ],
    reviewThreads: [
      {
        // No sourceNodeId on thread or comment → both fall back.
        isResolved: false,
        isOutdated: false,
        path: "src/a.ts",
        line: 12,
        startLine: null,
        comments: [
          {
            author: "carol",
            bodyText: "nit: rename",
            createdAt: "2026-05-01T11:00:00.000Z",
            updatedAt: null,
            url: null,
            path: "src/a.ts",
            line: 12,
          },
        ],
      },
    ],
  });

  const entities = buildEntityRows([pr], neverBotLogin);
  const bodies = buildBodyRows([pr]);

  it("review_id matches the review_body subject_id", () => {
    const reviewId = entities.pr_reviews[0]!.review_id as string;
    const reviewBody = bodies.find((row) => row.subject_kind === "review_body");

    expect(reviewBody).toBeDefined();
    expect(reviewBody!.subject_id).toBe(reviewId);
    // And it is the deterministic fallback (not a leaked Node.id).
    expect(reviewId).toBe(
      reviewKey(undefined, "PR_node_1", 0, "bob", "2026-05-01T10:00:00.000Z"),
    );
    expect(reviewId).toMatch(/^review:/);
  });

  it("comment_id matches the review_comment subject_id", () => {
    const threadId = entities.pr_review_threads[0]!.thread_id as string;
    const commentId = entities.pr_review_comments[0]!.comment_id as string;
    const reviewComment = bodies.find((row) => row.subject_kind === "review_comment");

    expect(reviewComment).toBeDefined();
    expect(reviewComment!.subject_id).toBe(commentId);
    expect(commentId).toBe(
      reviewCommentKey(undefined, "PR_node_1", threadId, 0, "2026-05-01T11:00:00.000Z"),
    );
    expect(threadId).toBe(
      reviewThreadKey(undefined, "PR_node_1", 0, "src/a.ts", 12),
    );
    expect(commentId).toMatch(/^review-comment:/);
  });

  it("prefers the real Node.id over the fallback when present", () => {
    expect(reviewKey("REVIEW_real", "PR_node_1", 0, "bob", null)).toBe("REVIEW_real");
    expect(reviewCommentKey("C_real", "PR_node_1", "T1", 0, null)).toBe("C_real");
    expect(reviewThreadKey("T_real", "PR_node_1", 0, "p", 1)).toBe("T_real");
  });
});
