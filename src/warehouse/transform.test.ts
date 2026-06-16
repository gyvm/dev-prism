import { describe, expect, it } from "vitest";

import { createBotLoginMatcher } from "../shared/bot.js";
import { makePr } from "../test-fixtures.js";
import { buildWarehouseRows } from "./transform.js";

function makeWarehousePr() {
  return makePr({
    repo: {
      owner: "openai",
      name: "codex",
      sourceNodeId: "R_1",
      visibility: "PRIVATE",
    },
    sourceNodeId: "PR_1",
    number: 42,
    title: "Implement DWH",
    bodyText: "PR body",
    url: "https://example.com/pr/42",
    state: "MERGED",
    author: "alice",
    authorActor: {
      sourceNodeId: "U_1",
      type: "User",
      login: "alice",
      slug: null,
      name: "Alice",
      url: "https://example.com/alice",
    },
    mergedByActor: {
      sourceNodeId: "U_2",
      type: "User",
      login: "merge-admin",
      slug: null,
      name: "Merge Admin",
      url: null,
    },
    createdAt: "2026-04-20T00:00:00.000Z",
    updatedAt: "2026-04-22T00:00:00.000Z",
    mergedAt: "2026-04-22T01:00:00.000Z",
    additions: 20,
    deletions: 5,
    changedFiles: 2,
    labels: [{ name: "feature" }],
    reviews: [
      {
        sourceNodeId: "REV_1",
        author: "reviewer-bot",
        authorActor: {
          sourceNodeId: "BOT_1",
          type: "Bot",
          login: "reviewer-bot",
          slug: null,
          name: null,
          url: null,
        },
        state: "APPROVED",
        submittedAt: "2026-04-21T00:00:00.000Z",
        updatedAt: "2026-04-21T00:10:00.000Z",
        commitOid: "abc",
        url: "https://example.com/review",
        bodyText: "review body",
      },
    ],
    reviewRequests: [
      {
        sourceNodeId: "REQ_1",
        requestedReviewer: "platform",
        requestedReviewerActor: {
          sourceNodeId: "TEAM_1",
          type: "Team",
          login: null,
          slug: "platform",
          name: "Platform",
          url: "https://example.com/team",
        },
        asCodeOwner: true,
      },
    ],
    timelineEvents: [
      {
        sourceNodeId: "READY_1",
        type: "ready_for_review",
        createdAt: "2026-04-20T01:00:00.000Z",
        actor: {
          sourceNodeId: "U_1",
          type: "User",
          login: "alice",
          slug: null,
          name: "Alice",
          url: null,
        },
      },
      {
        sourceNodeId: "RREQ_1",
        type: "review_requested",
        createdAt: "2026-04-20T02:00:00.000Z",
        actor: {
          sourceNodeId: "U_1",
          type: "User",
          login: "alice",
          slug: null,
          name: "Alice",
          url: null,
        },
        requestedReviewerActor: {
          sourceNodeId: "TEAM_1",
          type: "Team",
          login: null,
          slug: "platform",
          name: "Platform",
          url: null,
        },
      },
    ],
    comments: [
      {
        sourceNodeId: "IC_1",
        author: "renovate",
        authorActor: {
          sourceNodeId: "BOT_2",
          type: "User",
          login: "renovate",
          slug: null,
          name: null,
          url: null,
        },
        bodyText: "issue comment",
        createdAt: "2026-04-20T03:00:00.000Z",
        updatedAt: "2026-04-20T03:10:00.000Z",
        url: "https://example.com/comment",
      },
    ],
    reviewThreads: [
      {
        sourceNodeId: "TH_1",
        isResolved: true,
        isOutdated: false,
        path: "src/index.ts",
        line: 10,
        startLine: 8,
        subjectType: "LINE",
        resolvedByActor: {
          sourceNodeId: "U_3",
          type: "User",
          login: "carol",
          slug: null,
          name: "Carol",
          url: null,
        },
        comments: [
          {
            sourceNodeId: "RC_1",
            author: "dave",
            authorActor: {
              sourceNodeId: "U_4",
              type: "User",
              login: "dave",
              slug: null,
              name: "Dave",
              url: null,
            },
            bodyText: "review comment",
            createdAt: "2026-04-20T04:00:00.000Z",
            updatedAt: null,
            url: "https://example.com/review-comment",
            path: "src/index.ts",
            line: 10,
            originalLine: 9,
            state: "SUBMITTED",
            isOutdated: false,
            reviewSourceNodeId: "REV_1",
          },
        ],
      },
    ],
    commits: [
      {
        oid: "abc",
        committedDate: "2026-04-19T23:00:00.000Z",
        authoredDate: "2026-04-19T22:00:00.000Z",
        messageHeadline: "Implement DWH",
        author: "alice",
        authorActor: {
          sourceNodeId: "U_1",
          type: "User",
          login: "alice",
          slug: null,
          name: "Alice",
          url: null,
        },
        authorName: "Alice",
        authorEmail: "alice@example.com",
      },
    ],
    files: [
      { path: "src/index.ts", additions: 10, deletions: 2, changeType: "MODIFIED" },
      { path: "src/test.ts", additions: 10, deletions: 3, changeType: "ADDED" },
    ],
  });
}

describe("buildWarehouseRows", () => {
  it("maps normalized PR data into DWH table rows", () => {
    const rows = buildWarehouseRows([makeWarehousePr()], createBotLoginMatcher(["^renovate$"]));

    expect(rows.repos).toEqual([
      {
        repo_id: "R_1",
        repo_key: "openai/codex",
        owner: "openai",
        name: "codex",
        visibility: "PRIVATE",
      },
    ]);
    expect(rows.pull_requests[0]).toMatchObject({
      pr_id: "PR_1",
      pr_key: "openai/codex#42",
      repo_id: "R_1",
      author_actor_id: "U_1",
      merged_by_actor_id: "U_2",
      changed_files: 2,
      ready_for_review_at: "2026-04-20 01:00:00.000",
      first_review_at: "2026-04-21 00:00:00.000",
      first_approve_at: "2026-04-21 00:00:00.000",
    });
    expect(rows.pr_reviews[0]).toMatchObject({
      review_id: "REV_1",
      pr_id: "PR_1",
      author_actor_id: "BOT_1",
      state: "APPROVED",
      commit_oid: "abc",
    });
    expect(rows.pr_review_requests[0]).toMatchObject({
      request_id: "REQ_1",
      requested_actor_id: "TEAM_1",
      requested_actor_type: "Team",
      as_code_owner: true,
    });
    expect(rows.pr_review_threads[0]).toMatchObject({
      thread_id: "TH_1",
      resolved_by_actor_id: "U_3",
    });
    expect(rows.pr_review_comments[0]).toMatchObject({
      comment_id: "RC_1",
      review_id: "REV_1",
      author_actor_id: "U_4",
    });
    expect(rows.pr_commits[0]).toMatchObject({
      pr_id: "PR_1",
      oid: "abc",
      author_actor_id: "U_1",
      message_headline_len: "Implement DWH".length,
    });
    expect(rows.pr_files).toHaveLength(2);
    expect(rows.pr_labels).toEqual([{ pr_id: "PR_1", label: "feature" }]);
  });

  it("generates non-colliding lifecycle and commit event ids", () => {
    const rows = buildWarehouseRows([makeWarehousePr()], createBotLoginMatcher([]));
    const eventIds = rows.activities.map((row) => row.event_id);

    expect(eventIds).toContain("pr:pr_opened:PR_1");
    expect(eventIds).toContain("pr:pr_merged:PR_1");
    expect(eventIds).toContain("commit:PR_1:abc");
    expect(new Set(eventIds).size).toBe(eventIds.length);
  });

  it("classifies bots from both actor type and configured login patterns", () => {
    const rows = buildWarehouseRows([makeWarehousePr()], createBotLoginMatcher(["^renovate$"]));

    expect(rows.actors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ actor_id: "BOT_1", actor_type: "Bot", is_bot: true }),
        expect.objectContaining({ actor_id: "BOT_2", login: "renovate", is_bot: true }),
        expect.objectContaining({ actor_id: "TEAM_1", actor_type: "Team", is_bot: false }),
      ]),
    );
  });

  it("extracts PR, review, issue comment, and review comment bodies", () => {
    const rows = buildWarehouseRows([makeWarehousePr()], createBotLoginMatcher([]));

    expect(rows.bodies).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ subject_id: "PR_1", subject_kind: "pr_body", text: "PR body" }),
        expect.objectContaining({ subject_id: "REV_1", subject_kind: "review_body", text: "review body" }),
        expect.objectContaining({ subject_id: "IC_1", subject_kind: "issue_comment", text: "issue comment" }),
        expect.objectContaining({ subject_id: "RC_1", subject_kind: "review_comment", text: "review comment" }),
      ]),
    );
  });
});
