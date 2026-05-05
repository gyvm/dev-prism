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
});
