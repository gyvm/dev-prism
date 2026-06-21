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
  it('returns true for the GitHub default revert title (`Revert "…"`)', () => {
    expect(isFailureFix(makePr({ title: 'Revert "Add feature X"' }))).toBe(true);
    expect(isFailureFix(makePr({ title: 'Revert "Revert \\"oops\\""' }))).toBe(
      true,
    );
  });

  it("returns false for non-revert titles, regardless of labels", () => {
    expect(isFailureFix(makePr({ title: "Add feature X" }))).toBe(false);
    // labels no longer drive failure classification
    expect(
      isFailureFix(
        makePr({ title: "Hotfix login", labels: [{ name: "hotfix" }] }),
      ),
    ).toBe(false);
    expect(isFailureFix(makePr({ title: "reverting manually" }))).toBe(false);
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

  it("computes change failure rate from revert-titled PRs", () => {
    const prs = [
      makePr({ number: 1, title: "Add A", mergedAt: "2026-03-02T00:00:00.000Z" }),
      makePr({
        number: 2,
        title: 'Revert "Add A"',
        mergedAt: "2026-03-02T00:00:00.000Z",
      }),
      makePr({
        number: 3,
        title: 'Revert "Add B"',
        mergedAt: "2026-03-02T00:00:00.000Z",
      }),
      makePr({
        number: 4,
        title: "Add C",
        mergedAt: "2026-03-02T00:00:00.000Z",
      }),
    ];
    const result = computeDora(prs, baseAggregate);
    expect(result.changeFailureRatePercent).toBe(50);
  });

  it("computes MTTR as average lead time of revert-titled PRs", () => {
    const prs = [
      makePr({
        number: 1,
        title: 'Revert "Ship A"',
        createdAt: "2026-03-01T00:00:00.000Z",
        mergedAt: "2026-03-01T04:00:00.000Z",
      }),
      makePr({
        number: 2,
        title: 'Revert "Ship B"',
        createdAt: "2026-03-02T00:00:00.000Z",
        mergedAt: "2026-03-02T08:00:00.000Z",
      }),
      makePr({
        number: 3,
        title: "Ship C",
        createdAt: "2026-03-02T00:00:00.000Z",
        mergedAt: "2026-03-04T00:00:00.000Z",
      }),
    ];
    const result = computeDora(prs, baseAggregate);
    expect(result.mttrHours).toBe(6);
  });
});
