import { describe, it, expect } from "vitest";
import {
  median,
  percentile90,
  average,
  computeAggregateMetrics,
} from "./aggregate.js";
import { makePrMetrics } from "../../../test-fixtures.js";

describe("median", () => {
  it("returns the middle value for odd-length arrays", () => {
    expect(median([1, 2, 3])).toBe(2);
  });

  it("returns the average of two middle values for even-length arrays", () => {
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });

  it("returns null for empty arrays", () => {
    expect(median([])).toBeNull();
  });
});

describe("percentile90", () => {
  it("returns the correct P90 for a 10-element array", () => {
    expect(percentile90([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])).toBe(9);
  });

  it("returns null for empty arrays", () => {
    expect(percentile90([])).toBeNull();
  });
});

describe("average", () => {
  it("computes the mean", () => {
    expect(average([2, 4, 6])).toBe(4);
  });

  it("returns null for empty arrays", () => {
    expect(average([])).toBeNull();
  });
});

describe("computeAggregateMetrics", () => {
  it("computes correct counts and statistics", () => {
    const prs = [
      makePrMetrics({
        mergedAt: "2026-03-02T00:00:00.000Z",
        leadTimeHours: 24,
        timeToFirstReviewHours: 6,
      }),
      makePrMetrics({
        mergedAt: "2026-03-03T00:00:00.000Z",
        leadTimeHours: 48,
        timeToFirstReviewHours: 12,
      }),
      makePrMetrics({
        mergedAt: null,
        leadTimeHours: null,
        timeToFirstReviewHours: null,
      }),
    ];

    const result = computeAggregateMetrics(prs, 48);

    expect(result.totalPrCount).toBe(3);
    expect(result.mergedPrCount).toBe(2);
    expect(result.noReviewCount).toBe(1);
    expect(result.averageLeadTimeHours).toBe(36);
    expect(result.medianLeadTimeHours).toBe(36);
    expect(result.averageTimeToFirstReviewHours).toBe(9);
  });

  it("returns null statistics for empty input", () => {
    const result = computeAggregateMetrics([], 48);
    expect(result.totalPrCount).toBe(0);
    expect(result.averageLeadTimeHours).toBeNull();
    expect(result.medianLeadTimeHours).toBeNull();
    expect(result.p90LeadTimeHours).toBeNull();
  });

  it("counts thresholdExceededCount only for PRs strictly above the threshold", () => {
    const prs = [
      // strictly under
      makePrMetrics({ mergedAt: "2026-03-02T00:00:00.000Z", timeToFirstReviewHours: 6 }),
      // exactly at the threshold — NOT counted (strict >)
      makePrMetrics({ mergedAt: "2026-03-02T00:00:00.000Z", timeToFirstReviewHours: 24 }),
      // over
      makePrMetrics({ mergedAt: "2026-03-02T00:00:00.000Z", timeToFirstReviewHours: 25 }),
      makePrMetrics({ mergedAt: "2026-03-02T00:00:00.000Z", timeToFirstReviewHours: 100 }),
      // null (no review) — NOT counted toward exceeded; counted in noReviewCount instead
      makePrMetrics({ mergedAt: null, timeToFirstReviewHours: null }),
    ];

    const result = computeAggregateMetrics(prs, 24);

    expect(result.thresholdExceededCount).toBe(2);
    expect(result.noReviewCount).toBe(1);
  });

  it("computes p90LeadTimeHours from merged PRs only", () => {
    const prs = Array.from({ length: 10 }, (_, i) =>
      makePrMetrics({
        number: i + 1,
        mergedAt: `2026-03-${String(i + 1).padStart(2, "0")}T00:00:00.000Z`,
        leadTimeHours: (i + 1) * 10, // 10, 20, ..., 100
      }),
    );
    // Add an unmerged PR with bogus leadTimeHours that should be ignored.
    prs.push(makePrMetrics({ mergedAt: null, leadTimeHours: null }));

    const result = computeAggregateMetrics(prs, 48);

    // sorted [10..100], P90 (nearest-rank) = sorted[ceil(10*0.9)-1] = sorted[8] = 90
    expect(result.p90LeadTimeHours).toBe(90);
    expect(result.medianLeadTimeHours).toBe(55);
    expect(result.mergedPrCount).toBe(10);
  });

  it("noReviewCount preserves current behavior: unmerged PRs without review are counted", () => {
    const prs = [
      makePrMetrics({ mergedAt: "2026-03-02T00:00:00.000Z", timeToFirstReviewHours: 6 }),
      makePrMetrics({ mergedAt: null, timeToFirstReviewHours: null }), // unmerged, no review
      makePrMetrics({ mergedAt: "2026-03-03T00:00:00.000Z", timeToFirstReviewHours: null }), // merged, no review
    ];
    const result = computeAggregateMetrics(prs, 48);
    expect(result.noReviewCount).toBe(2);
  });
});
