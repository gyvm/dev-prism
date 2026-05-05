import { describe, expect, it } from "vitest";
import { computeReviewCorrelation } from "./reviewCorrelation.js";
import { createBotLoginMatcher } from "../../../shared/bot.js";
import { makePr } from "../../../test-fixtures.js";

describe("computeReviewCorrelation", () => {
  it("returns empty data for no PRs", () => {
    expect(computeReviewCorrelation([])).toEqual({
      authors: [],
      reviewers: [],
      pairs: [],
    });
  });

  it("counts authors and reviewers across PRs", () => {
    const prs = [
      makePr({
        number: 1,
        author: "alice",
        reviews: [
          { author: "bob", state: "APPROVED", submittedAt: "2026-03-02T00:00:00.000Z" },
        ],
      }),
      makePr({
        number: 2,
        author: "alice",
        reviews: [
          { author: "carol", state: "APPROVED", submittedAt: "2026-03-02T00:00:00.000Z" },
        ],
      }),
      makePr({
        number: 3,
        author: "bob",
        reviews: [
          { author: "alice", state: "APPROVED", submittedAt: "2026-03-02T00:00:00.000Z" },
          { author: "carol", state: "APPROVED", submittedAt: "2026-03-02T00:00:00.000Z" },
        ],
      }),
    ];
    const result = computeReviewCorrelation(prs);
    expect(result.authors).toEqual([
      { login: "alice", prCount: 2, kind: "human" },
      { login: "bob", prCount: 1, kind: "human" },
    ]);
    expect(result.reviewers).toEqual([
      { login: "carol", reviewCount: 2, kind: "human" },
      { login: "alice", reviewCount: 1, kind: "human" },
      { login: "bob", reviewCount: 1, kind: "human" },
    ]);
  });

  it("excludes self-reviews", () => {
    const prs = [
      makePr({
        number: 1,
        author: "alice",
        reviews: [
          { author: "alice", state: "APPROVED", submittedAt: "2026-03-02T00:00:00.000Z" },
          { author: "bob", state: "APPROVED", submittedAt: "2026-03-02T00:00:00.000Z" },
        ],
      }),
    ];
    const result = computeReviewCorrelation(prs);
    expect(result.reviewers).toEqual([{ login: "bob", reviewCount: 1, kind: "human" }]);
    expect(result.pairs).toEqual([{ author: "alice", reviewer: "bob", count: 1 }]);
  });

  it("dedupes multiple reviews from the same reviewer on the same PR", () => {
    const prs = [
      makePr({
        number: 1,
        author: "alice",
        reviews: [
          { author: "bob", state: "COMMENTED", submittedAt: "2026-03-02T00:00:00.000Z" },
          { author: "bob", state: "APPROVED", submittedAt: "2026-03-02T01:00:00.000Z" },
        ],
      }),
    ];
    const result = computeReviewCorrelation(prs);
    expect(result.reviewers).toEqual([{ login: "bob", reviewCount: 1, kind: "human" }]);
    expect(result.pairs).toEqual([{ author: "alice", reviewer: "bob", count: 1 }]);
  });

  it("sorts pairs by count descending", () => {
    const prs = [
      makePr({
        number: 1,
        author: "alice",
        reviews: [
          { author: "bob", state: "APPROVED", submittedAt: "2026-03-02T00:00:00.000Z" },
        ],
      }),
      makePr({
        number: 2,
        author: "alice",
        reviews: [
          { author: "bob", state: "APPROVED", submittedAt: "2026-03-02T00:00:00.000Z" },
          { author: "carol", state: "APPROVED", submittedAt: "2026-03-02T00:00:00.000Z" },
        ],
      }),
    ];
    const result = computeReviewCorrelation(prs);
    expect(result.pairs).toEqual([
      { author: "alice", reviewer: "bob", count: 2 },
      { author: "alice", reviewer: "carol", count: 1 },
    ]);
  });

  it("marks exact and suffix pattern matches as bot", () => {
    const prs = [
      makePr({
        number: 1,
        author: "renovate",
        reviews: [
          { author: "reviewer-bot", state: "APPROVED", submittedAt: "2026-03-02T00:00:00.000Z" },
        ],
      }),
    ];
    const result = computeReviewCorrelation(
      prs,
      createBotLoginMatcher(["^renovate$", "-bot$"]),
    );
    expect(result.authors).toEqual([{ login: "renovate", prCount: 1, kind: "bot" }]);
    expect(result.reviewers).toEqual([
      { login: "reviewer-bot", reviewCount: 1, kind: "bot" },
    ]);
  });
});
