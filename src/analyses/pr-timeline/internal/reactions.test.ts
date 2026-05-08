import { describe, it, expect } from "vitest";
import { findFirstReaction, reactionTimestamps, resolveReactions } from "./reactions.js";
import { createBotLoginMatcher, neverBotLogin } from "../../../shared/bot.js";
import { makePr } from "../../../test-fixtures.js";

const isBotLogin = createBotLoginMatcher(["\\[bot\\]$"]);

describe("findFirstReaction", () => {
  it("excludes PR author and bots, picks the earliest external reactor", () => {
    const pr = makePr({
      author: "alice",
      reviews: [
        { author: "alice", state: "COMMENTED", submittedAt: "2026-03-28T01:00:00.000Z" }, // self
        { author: "renovate[bot]", state: "COMMENTED", submittedAt: "2026-03-28T02:00:00.000Z" }, // bot
        { author: "bob", state: "COMMENTED", submittedAt: "2026-03-28T08:00:00.000Z" },
      ],
    });
    expect(findFirstReaction(pr, isBotLogin)).toEqual({
      at: "2026-03-28T08:00:00.000Z",
      by: "bob",
    });
  });

  it("considers issue comments and review-thread comments", () => {
    const pr = makePr({
      author: "alice",
      comments: [
        { author: "bob", bodyText: "x", createdAt: "2026-03-28T05:00:00.000Z", updatedAt: null, url: null },
      ],
      reviewThreads: [
        {
          isResolved: false,
          isOutdated: false,
          path: "x.ts",
          line: 10,
          startLine: null,
          comments: [
            { author: "carol", bodyText: "nit", createdAt: "2026-03-28T03:00:00.000Z", updatedAt: null, url: null, path: "x.ts", line: 10 },
          ],
        },
      ],
      reviews: [
        { author: "dave", state: "APPROVED", submittedAt: "2026-03-28T20:00:00.000Z" },
      ],
    });
    const result = findFirstReaction(pr, isBotLogin);
    expect(result).toEqual({ at: "2026-03-28T03:00:00.000Z", by: "carol" });
  });

  it("ignores PENDING / DISMISSED reviews", () => {
    const pr = makePr({
      author: "alice",
      reviews: [
        { author: "bob", state: "PENDING", submittedAt: "2026-03-28T01:00:00.000Z" },
        { author: "bob", state: "DISMISSED", submittedAt: "2026-03-28T02:00:00.000Z" },
        { author: "bob", state: "APPROVED", submittedAt: "2026-03-28T03:00:00.000Z" },
      ],
    });
    expect(findFirstReaction(pr, isBotLogin)).toEqual({
      at: "2026-03-28T03:00:00.000Z",
      by: "bob",
    });
  });

  it("returns null when there are no external reactions", () => {
    const pr = makePr({ author: "alice", reviews: [], comments: [], reviewThreads: [] });
    expect(findFirstReaction(pr, isBotLogin)).toBeNull();
  });
});

describe("reactionTimestamps", () => {
  it("collects timestamps from reviews + issue comments + thread comments", () => {
    const pr = makePr({
      author: "alice",
      reviews: [
        { author: "bob", state: "COMMENTED", submittedAt: "2026-03-28T01:00:00.000Z" },
      ],
      comments: [
        { author: "bob", bodyText: "x", createdAt: "2026-03-28T05:00:00.000Z", updatedAt: null, url: null },
      ],
      reviewThreads: [
        {
          isResolved: false,
          isOutdated: false,
          path: "x.ts",
          line: 10,
          startLine: null,
          comments: [
            { author: "carol", bodyText: "nit", createdAt: "2026-03-28T03:00:00.000Z", updatedAt: null, url: null, path: "x.ts", line: 10 },
          ],
        },
      ],
    });
    expect(reactionTimestamps(pr, isBotLogin)).toEqual([
      "2026-03-28T01:00:00.000Z",
      "2026-03-28T05:00:00.000Z",
      "2026-03-28T03:00:00.000Z",
    ]);
  });
});

describe("resolveReactions", () => {
  it("uses humans when at least one human reaction exists", () => {
    const pr = makePr({
      author: "alice",
      mergedAt: "2026-03-29T00:00:00.000Z",
      reviews: [
        { author: "renovate[bot]", state: "COMMENTED", submittedAt: "2026-03-28T01:00:00.000Z" },
        { author: "bob", state: "APPROVED", submittedAt: "2026-03-28T08:00:00.000Z" },
      ],
    });
    const r = resolveReactions(pr, isBotLogin);
    expect(r.firstReaction).toEqual({ at: "2026-03-28T08:00:00.000Z", by: "bob" });
    expect(r.reactions).toEqual(["2026-03-28T08:00:00.000Z"]);
  });

  it("falls back to bots for merged PRs that only have bot reactions", () => {
    const pr = makePr({
      author: "alice",
      mergedAt: "2026-03-29T00:00:00.000Z",
      reviews: [
        { author: "coderabbitai[bot]", state: "COMMENTED", submittedAt: "2026-03-28T02:00:00.000Z" },
      ],
    });
    const r = resolveReactions(pr, isBotLogin);
    expect(r.firstReaction).toEqual({
      at: "2026-03-28T02:00:00.000Z",
      by: "coderabbitai[bot]",
    });
    expect(r.reactions).toHaveLength(1);
  });

  it("does NOT fall back for unmerged PRs (open or closed-unmerged)", () => {
    const pr = makePr({
      author: "alice",
      mergedAt: null,
      closedAt: null,
      reviews: [
        { author: "renovate[bot]", state: "COMMENTED", submittedAt: "2026-03-28T01:00:00.000Z" },
      ],
    });
    const r = resolveReactions(pr, isBotLogin);
    expect(r.firstReaction).toBeNull();
    expect(r.reactions).toEqual([]);
  });

  it("returns null/empty when there are no reactions at all", () => {
    const pr = makePr({ author: "alice", mergedAt: "2026-03-29T00:00:00.000Z" });
    const r = resolveReactions(pr, isBotLogin);
    expect(r.firstReaction).toBeNull();
    expect(r.reactions).toEqual([]);
  });

  it("treats bot-like logins as human when no bot pattern is configured", () => {
    const pr = makePr({
      author: "alice",
      mergedAt: "2026-03-29T00:00:00.000Z",
      reviews: [
        { author: "renovate[bot]", state: "COMMENTED", submittedAt: "2026-03-28T01:00:00.000Z" },
      ],
    });
    const r = resolveReactions(pr, neverBotLogin);
    expect(r.firstReaction).toEqual({
      at: "2026-03-28T01:00:00.000Z",
      by: "renovate[bot]",
    });
  });
});
