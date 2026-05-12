import { describe, it, expect } from "vitest";
import {
  findFirstReviewDate,
  classifyPrSize,
  calculatePrMetrics,
} from "./calculate.js";
import { makePr } from "../../../test-fixtures.js";

describe("findFirstReviewDate", () => {
  it("returns the earliest submittedAt", () => {
    const reviews = [
      { author: "bob", state: "COMMENTED" as const, submittedAt: "2026-03-02T12:00:00.000Z" },
      { author: "carol", state: "APPROVED" as const, submittedAt: "2026-03-01T06:00:00.000Z" },
      { author: "dave", state: "CHANGES_REQUESTED" as const, submittedAt: "2026-03-03T00:00:00.000Z" },
    ];
    expect(findFirstReviewDate(reviews)).toBe("2026-03-01T06:00:00.000Z");
  });

  it("returns null when all reviews have null submittedAt", () => {
    const reviews = [
      { author: "bob", state: "PENDING" as const, submittedAt: null },
    ];
    expect(findFirstReviewDate(reviews)).toBeNull();
  });

  it("returns null for empty reviews array", () => {
    expect(findFirstReviewDate([])).toBeNull();
  });

  it("skips reviews with null submittedAt", () => {
    const reviews = [
      { author: "bob", state: "PENDING" as const, submittedAt: null },
      { author: "carol", state: "APPROVED" as const, submittedAt: "2026-03-05T10:00:00.000Z" },
    ];
    expect(findFirstReviewDate(reviews)).toBe("2026-03-05T10:00:00.000Z");
  });
});

describe("classifyPrSize", () => {
  it("returns small for 0 lines", () => {
    expect(classifyPrSize(0)).toBe("small");
  });

  it("returns small for 99 lines", () => {
    expect(classifyPrSize(99)).toBe("small");
  });

  it("returns medium for 100 lines", () => {
    expect(classifyPrSize(100)).toBe("medium");
  });

  it("returns medium for 499 lines", () => {
    expect(classifyPrSize(499)).toBe("medium");
  });

  it("returns large for 500 lines", () => {
    expect(classifyPrSize(500)).toBe("large");
  });

  it("returns large for 1000 lines", () => {
    expect(classifyPrSize(1000)).toBe("large");
  });
});

describe("calculatePrMetrics", () => {
  it("computes all metrics for a merged PR with reviews", () => {
    const pr = makePr({
      createdAt: "2026-03-01T00:00:00.000Z",
      mergedAt: "2026-03-03T12:00:00.000Z",
      additions: 80,
      deletions: 20,
      reviews: [
        { author: "bob", state: "COMMENTED", submittedAt: "2026-03-01T12:00:00.000Z" },
        { author: "carol", state: "APPROVED", submittedAt: "2026-03-02T00:00:00.000Z" },
      ],
    });

    const metrics = calculatePrMetrics(pr);

    expect(metrics.leadTimeHours).toBe(60);
    expect(metrics.timeToFirstReviewHours).toBe(12);
    expect(metrics.timeToMergeAfterFirstReviewHours).toBe(48);
    expect(metrics.firstReviewedAt).toBe("2026-03-01T12:00:00.000Z");
    expect(metrics.prSize).toBe("medium");
    expect(metrics.totalLinesChanged).toBe(100);
  });

  it("returns null lead time for unmerged PR", () => {
    const pr = makePr({ mergedAt: null });
    const metrics = calculatePrMetrics(pr);
    expect(metrics.leadTimeHours).toBeNull();
    expect(metrics.timeToMergeAfterFirstReviewHours).toBeNull();
  });

  it("returns null timeToFirstReview when no reviews", () => {
    const pr = makePr({ reviews: [] });
    const metrics = calculatePrMetrics(pr);
    expect(metrics.timeToFirstReviewHours).toBeNull();
    expect(metrics.firstReviewedAt).toBeNull();
  });

  it("returns null timeToMergeAfterFirstReview when merged but no review", () => {
    const pr = makePr({
      mergedAt: "2026-03-02T00:00:00.000Z",
      reviews: [],
    });
    const metrics = calculatePrMetrics(pr);
    expect(metrics.leadTimeHours).toBe(24);
    expect(metrics.timeToMergeAfterFirstReviewHours).toBeNull();
  });

  it("preserves repo, number, title, author, createdAt, mergedAt", () => {
    const pr = makePr({
      repo: { owner: "org", name: "project" },
      number: 42,
      title: "Feature X",
      author: "alice",
    });
    const metrics = calculatePrMetrics(pr);
    expect(metrics.repo).toEqual({ owner: "org", name: "project" });
    expect(metrics.number).toBe(42);
    expect(metrics.title).toBe("Feature X");
    expect(metrics.author).toBe("alice");
  });
});
