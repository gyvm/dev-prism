import { describe, expect, it } from "vitest";
import { computeDora, isFailureFix } from "./dora.js";
import type { AggregateMetrics } from "../../../shared/types.js";
import { makePr } from "../../../test-fixtures.js";

const baseAggregate: AggregateMetrics = {
  totalPrCount: 0,
  mergedPrCount: 0,
  noReviewCount: 0,
  thresholdExceededCount: 0,
  averageLeadTimeHours: null,
  medianLeadTimeHours: 12,
  p90LeadTimeHours: null,
  averageTimeToFirstReviewHours: null,
};

describe("isFailureFix", () => {
  it("returns true for hotfix/revert/incident labels (case-insensitive)", () => {
    expect(isFailureFix(makePr({ labels: [{ name: "hotfix" }] }))).toBe(true);
    expect(isFailureFix(makePr({ labels: [{ name: "Revert" }] }))).toBe(true);
    expect(isFailureFix(makePr({ labels: [{ name: "INCIDENT" }] }))).toBe(true);
  });

  it("returns false for unrelated labels", () => {
    expect(isFailureFix(makePr({ labels: [{ name: "feature" }] }))).toBe(false);
    expect(isFailureFix(makePr({ labels: [] }))).toBe(false);
  });
});

describe("computeDora", () => {
  it("returns nulls when no merged PRs", () => {
    const result = computeDora([], baseAggregate);
    expect(result).toEqual({
      deploymentFrequency: 0,
      leadTimeForChangesHours: 12,
      changeFailureRatePercent: null,
      mttrHours: null,
    });
  });

  it("counts deploymentFrequency as merged PRs", () => {
    const prs = [
      makePr({ number: 1, mergedAt: "2026-03-02T00:00:00.000Z" }),
      makePr({ number: 2, mergedAt: "2026-03-03T00:00:00.000Z" }),
      makePr({ number: 3, mergedAt: null }),
    ];
    const result = computeDora(prs, baseAggregate);
    expect(result.deploymentFrequency).toBe(2);
  });

  it("computes change failure rate from labels", () => {
    const prs = [
      makePr({ number: 1, mergedAt: "2026-03-02T00:00:00.000Z" }),
      makePr({
        number: 2,
        mergedAt: "2026-03-02T00:00:00.000Z",
        labels: [{ name: "hotfix" }],
      }),
      makePr({
        number: 3,
        mergedAt: "2026-03-02T00:00:00.000Z",
        labels: [{ name: "revert" }],
      }),
      makePr({
        number: 4,
        mergedAt: "2026-03-02T00:00:00.000Z",
        labels: [{ name: "feature" }],
      }),
    ];
    const result = computeDora(prs, baseAggregate);
    expect(result.changeFailureRatePercent).toBe(50);
  });

  it("computes MTTR as average lead time of failure-fix PRs", () => {
    const prs = [
      makePr({
        number: 1,
        createdAt: "2026-03-01T00:00:00.000Z",
        mergedAt: "2026-03-01T04:00:00.000Z",
        labels: [{ name: "hotfix" }],
      }),
      makePr({
        number: 2,
        createdAt: "2026-03-02T00:00:00.000Z",
        mergedAt: "2026-03-02T08:00:00.000Z",
        labels: [{ name: "hotfix" }],
      }),
      makePr({
        number: 3,
        createdAt: "2026-03-02T00:00:00.000Z",
        mergedAt: "2026-03-04T00:00:00.000Z",
      }),
    ];
    const result = computeDora(prs, baseAggregate);
    expect(result.mttrHours).toBe(6);
  });
});
