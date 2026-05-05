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
});
