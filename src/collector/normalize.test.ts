import { describe, expect, it } from "vitest";

import { normalizePullRequest } from "./normalize.js";

describe("normalizePullRequest", () => {
  it("maps a fully populated PR correctly", () => {
    const normalized = normalizePullRequest(
      { owner: "openai", name: "codex" },
      {
        number: 42,
        title: "Implement collector",
        author: { login: "alice" },
        createdAt: "2026-04-01T00:00:00.000Z",
        mergedAt: "2026-04-02T00:00:00.000Z",
        closedAt: "2026-04-02T00:00:00.000Z",
        additions: 10,
        deletions: 4,
        labels: { nodes: [{ name: "enhancement" }, null, { name: "collector" }] },
        reviews: {
          nodes: [
            { author: { login: "bob" }, state: "APPROVED", submittedAt: "2026-04-01T12:00:00.000Z" },
          ],
        },
        reviewRequests: {
          nodes: [{ requestedReviewer: { login: "carol" } }],
        },
      },
    );

    expect(normalized.repo).toEqual({ owner: "openai", name: "codex" });
    expect(normalized.number).toBe(42);
    expect(normalized.author).toBe("alice");
    expect(normalized.mergedAt).toBe("2026-04-02T00:00:00.000Z");
    expect(normalized.labels).toEqual([{ name: "enhancement" }, { name: "collector" }]);
    expect(normalized.reviews).toEqual([
      { author: "bob", state: "APPROVED", submittedAt: "2026-04-01T12:00:00.000Z" },
    ]);
    expect(normalized.reviewRequests).toEqual([{ requestedReviewer: "carol" }]);
  });

  it("maps optional actors and timestamps to null", () => {
    const normalized = normalizePullRequest(
      { owner: "openai", name: "codex" },
      {
        number: 42,
        title: "Implement collector",
        author: null,
        createdAt: "2026-04-01T00:00:00.000Z",
        mergedAt: null,
        closedAt: null,
        additions: 10,
        deletions: 4,
        labels: { nodes: [] },
        reviews: {
          nodes: [{ author: null, state: null, submittedAt: null }],
        },
        reviewRequests: {
          nodes: [{ requestedReviewer: { slug: "platform-team" } }],
        },
      },
    );

    expect(normalized.author).toBeNull();
    expect(normalized.reviews).toEqual([
      { author: null, state: null, submittedAt: null },
    ]);
    expect(normalized.reviewRequests).toEqual([
      { requestedReviewer: "platform-team" },
    ]);
  });

  it("maps broad PR discussion data for report analysis", () => {
    const normalized = normalizePullRequest(
      { owner: "openai", name: "codex" },
      {
        number: 7,
        title: "Add report",
        bodyText: "Report body",
        url: "https://github.com/openai/codex/pull/7",
        state: "MERGED",
        author: { login: "alice" },
        createdAt: "2026-04-20T00:00:00.000Z",
        mergedAt: "2026-04-21T00:00:00.000Z",
        closedAt: "2026-04-21T00:00:00.000Z",
        additions: 20,
        deletions: 5,
        comments: {
          nodes: [
            {
              author: { login: "bob" },
              bodyText: "Please follow up on docs.",
              createdAt: "2026-04-20T03:00:00.000Z",
              updatedAt: "2026-04-20T03:10:00.000Z",
              url: "https://example.com/comment",
            },
          ],
        },
        reviews: {
          nodes: [
            {
              author: { login: "carol" },
              state: "COMMENTED",
              submittedAt: "2026-04-20T04:00:00.000Z",
              bodyText: "Let's discuss the API shape.",
            },
          ],
        },
        reviewThreads: {
          nodes: [
            {
              isResolved: false,
              isOutdated: false,
              path: "src/report.ts",
              line: 12,
              startLine: 10,
              comments: {
                nodes: [
                  {
                    author: { login: "dave" },
                    bodyText: "Can this be split?",
                    createdAt: "2026-04-20T05:00:00.000Z",
                    updatedAt: null,
                    url: "https://example.com/thread",
                    path: "src/report.ts",
                    line: 12,
                  },
                ],
              },
            },
          ],
        },
        commits: {
          nodes: [
            {
              commit: {
                oid: "abc",
                committedDate: "2026-04-19T23:00:00.000Z",
                messageHeadline: "Add report implementation",
                author: { user: { login: "alice" } },
              },
            },
          ],
        },
        files: {
          nodes: [
            { path: "src/report.ts", additions: 20, deletions: 5, changeType: "ADDED" },
          ],
        },
      },
    );

    expect(normalized.bodyText).toBe("Report body");
    expect(normalized.comments?.[0]?.bodyText).toContain("follow up");
    expect(normalized.reviews[0]?.bodyText).toContain("API shape");
    expect(normalized.reviewThreads?.[0]?.comments[0]?.path).toBe("src/report.ts");
    expect(normalized.commits?.[0]?.committedDate).toBe("2026-04-19T23:00:00.000Z");
    expect(normalized.files?.[0]?.path).toBe("src/report.ts");
  });

  it("passes through source ids, updatedAt, and actor typenames for DWH build", () => {
    const normalized = normalizePullRequest(
      { owner: "openai", name: "codex" },
      {
        id: "PR_kwDO123",
        number: 7,
        title: "Add warehouse feed",
        repository: {
          id: "R_1",
          name: "codex",
          owner: { login: "openai" },
          visibility: "PRIVATE",
        },
        author: { __typename: "User", id: "U_1", login: "alice", name: "Alice", url: "https://example.com/alice" },
        createdAt: "2026-04-20T00:00:00.000Z",
        updatedAt: "2026-04-22T00:00:00.000Z",
        mergedBy: { __typename: "User", id: "U_5", login: "merge-admin" },
        additions: 20,
        deletions: 5,
        changedFiles: 3,
        reviews: {
          nodes: [
            {
              id: "REV_1",
              author: { __typename: "Bot", id: "BOT_1", login: "reviewer-bot", url: "https://example.com/bot" },
              state: "APPROVED",
              submittedAt: "2026-04-20T04:00:00.000Z",
              updatedAt: "2026-04-20T04:01:00.000Z",
              commit: { oid: "abc123" },
              url: "https://example.com/review",
            },
          ],
        },
        reviewRequests: {
          nodes: [
            {
              id: "REQ_1",
              asCodeOwner: true,
              requestedReviewer: {
                __typename: "Team",
                id: "TEAM_1",
                slug: "platform",
                name: "Platform",
                url: "https://example.com/team",
              },
            },
          ],
        },
        timelineItems: {
          nodes: [
            {
              id: "EV_1",
              __typename: "ReviewRequestedEvent",
              createdAt: "2026-04-20T02:00:00.000Z",
              actor: { __typename: "User", id: "U_1", login: "alice" },
              requestedReviewer: { __typename: "Team", id: "TEAM_1", slug: "platform" },
            },
          ],
        },
        comments: {
          nodes: [
            {
              id: "IC_1",
              author: { __typename: "User", id: "U_2", login: "bob" },
              bodyText: "Looks good",
              createdAt: "2026-04-20T03:00:00.000Z",
              updatedAt: "2026-04-20T03:10:00.000Z",
              url: "https://example.com/comment",
            },
          ],
        },
        reviewThreads: {
          nodes: [
            {
              id: "TH_1",
              isResolved: true,
              isOutdated: false,
              path: "src/report.ts",
              line: 12,
              startLine: 10,
              subjectType: "LINE",
              resolvedBy: { __typename: "User", id: "U_3", login: "carol" },
              comments: {
                nodes: [
                  {
                    id: "RC_1",
                    author: { __typename: "User", id: "U_4", login: "dave" },
                    bodyText: "Can this be split?",
                    createdAt: "2026-04-20T05:00:00.000Z",
                    updatedAt: null,
                    url: "https://example.com/thread",
                    path: "src/report.ts",
                    line: 12,
                    originalLine: 11,
                    state: "SUBMITTED",
                    outdated: false,
                    pullRequestReview: { id: "REV_1" },
                  },
                ],
              },
            },
          ],
        },
        commits: {
          nodes: [
            {
              commit: {
                oid: "abc",
                committedDate: "2026-04-19T23:00:00.000Z",
                messageHeadline: "Add report implementation",
                author: {
                  user: { __typename: "User", id: "U_1", login: "alice", name: "Alice" },
                  name: "Alice",
                  email: "alice@example.com",
                },
              },
            },
          ],
        },
      },
    );

    expect(normalized.sourceNodeId).toBe("PR_kwDO123");
    expect(normalized.repo).toMatchObject({ sourceNodeId: "R_1", visibility: "PRIVATE" });
    expect(normalized.changedFiles).toBe(3);
    expect(normalized.updatedAt).toBe("2026-04-22T00:00:00.000Z");
    expect(normalized.authorActor).toMatchObject({ sourceNodeId: "U_1", type: "User", login: "alice" });
    expect(normalized.mergedByActor).toMatchObject({ sourceNodeId: "U_5", type: "User", login: "merge-admin" });
    expect(normalized.reviews[0]).toMatchObject({
      sourceNodeId: "REV_1",
      authorActor: { sourceNodeId: "BOT_1", type: "Bot", login: "reviewer-bot" },
      updatedAt: "2026-04-20T04:01:00.000Z",
      commitOid: "abc123",
    });
    expect(normalized.reviewRequests[0]).toMatchObject({
      sourceNodeId: "REQ_1",
      requestedReviewer: "platform",
      requestedReviewerActor: { sourceNodeId: "TEAM_1", type: "Team", slug: "platform" },
      asCodeOwner: true,
    });
    expect(normalized.timelineEvents[0]).toMatchObject({
      sourceNodeId: "EV_1",
      actor: { sourceNodeId: "U_1", type: "User", login: "alice" },
      requestedReviewerActor: { sourceNodeId: "TEAM_1", type: "Team", slug: "platform" },
    });
    expect(normalized.comments[0]).toMatchObject({
      sourceNodeId: "IC_1",
      authorActor: { sourceNodeId: "U_2", type: "User", login: "bob" },
    });
    expect(normalized.reviewThreads[0]).toMatchObject({
      sourceNodeId: "TH_1",
      subjectType: "LINE",
      resolvedByActor: { sourceNodeId: "U_3", type: "User", login: "carol" },
    });
    expect(normalized.reviewThreads[0]?.comments[0]).toMatchObject({
      sourceNodeId: "RC_1",
      authorActor: { sourceNodeId: "U_4", type: "User", login: "dave" },
      originalLine: 11,
      state: "SUBMITTED",
      isOutdated: false,
      reviewSourceNodeId: "REV_1",
    });
    expect(normalized.commits[0]).toMatchObject({
      authorActor: { sourceNodeId: "U_1", type: "User", login: "alice" },
      authorName: "Alice",
      authorEmail: "alice@example.com",
    });
  });

  it("filters out null entries in reviews and reviewRequests arrays", () => {
    const normalized = normalizePullRequest(
      { owner: "openai", name: "codex" },
      {
        number: 1,
        title: "Test",
        author: null,
        createdAt: "2026-04-01T00:00:00.000Z",
        mergedAt: null,
        closedAt: null,
        additions: 0,
        deletions: 0,
        labels: { nodes: [] },
        reviews: {
          nodes: [null, { author: { login: "alice" }, state: "APPROVED", submittedAt: null }, null],
        },
        reviewRequests: {
          nodes: [null, { requestedReviewer: { login: "bob" } }],
        },
      },
    );

    expect(normalized.reviews).toHaveLength(1);
    expect(normalized.reviews[0]!.author).toBe("alice");
    expect(normalized.reviewRequests).toHaveLength(1);
    expect(normalized.reviewRequests[0]!.requestedReviewer).toBe("bob");
  });

  it("maps unknown review state to null", () => {
    const normalized = normalizePullRequest(
      { owner: "openai", name: "codex" },
      {
        number: 1,
        title: "Test",
        createdAt: "2026-04-01T00:00:00.000Z",
        additions: 0,
        deletions: 0,
        reviews: {
          nodes: [
            { state: "APPROVED" },
            { state: "NOT_A_REAL_STATE" },
            { state: null },
          ],
        },
      },
    );

    expect(normalized.reviews.map((r) => r.state)).toEqual(["APPROVED", null, null]);
  });

  it("throws when required fields are missing", () => {
    expect(() =>
      normalizePullRequest(
        { owner: "openai", name: "codex" },
        {
          number: null,
        },
      ),
    ).toThrow(/missing required fields/i);
  });

  it("drops comments/commits/files missing required fields, keeping valid siblings", () => {
    const normalized = normalizePullRequest(
      { owner: "openai", name: "codex" },
      {
        number: 1,
        title: "Test",
        createdAt: "2026-04-01T00:00:00.000Z",
        additions: 0,
        deletions: 0,
        comments: {
          nodes: [
            { author: { login: "a" }, bodyText: "ok", createdAt: "2026-04-01T01:00:00.000Z" },
            { author: { login: "b" }, bodyText: null, createdAt: "2026-04-01T02:00:00.000Z" }, // no body → dropped
            { author: { login: "c" }, bodyText: "x", createdAt: null }, // no createdAt → dropped
          ],
        },
        commits: {
          nodes: [
            { commit: { oid: "C1", committedDate: "2026-04-01T00:00:00.000Z", messageHeadline: "ok" } },
            { commit: { oid: null, committedDate: "2026-04-01T00:00:00.000Z", messageHeadline: "x" } }, // no oid → dropped
            { commit: { oid: "C3", committedDate: null, messageHeadline: "x" } }, // no date → dropped
          ],
        },
        files: {
          nodes: [
            { path: "a.ts", additions: 1, deletions: 0, changeType: "MODIFIED" },
            { path: "b.ts", additions: null, deletions: 0 }, // no additions → dropped
            { path: null, additions: 1, deletions: 0 }, // no path → dropped
          ],
        },
      },
    );

    expect(normalized.comments.map((c) => c.author)).toEqual(["a"]);
    expect(normalized.commits.map((c) => c.oid)).toEqual(["C1"]);
    expect(normalized.files?.map((f) => f.path)).toEqual(["a.ts"]);
  });
});
