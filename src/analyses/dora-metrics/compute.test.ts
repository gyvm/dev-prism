import { describe, it, expect } from "vitest";
import { compute } from "./compute.js";
import { makePr, makeAnalysisContext } from "../../test-fixtures.js";
import type { DoraMetrics } from "../../shared/types.js";

const WEEK_START = new Date("2026-04-27T00:00:00.000Z");
const WEEK_END = new Date("2026-05-03T23:59:59.999Z");

describe("dora-metrics compute (week-scoped)", () => {
  it("counts only PRs merged within the week", () => {
    const prs = [
      // before week — excluded
      makePr({ number: 1, createdAt: "2026-04-10T00:00:00.000Z", mergedAt: "2026-04-15T00:00:00.000Z" }),
      // in-week — included
      makePr({ number: 2, createdAt: "2026-04-26T00:00:00.000Z", mergedAt: "2026-04-28T00:00:00.000Z" }),
      makePr({ number: 3, createdAt: "2026-04-27T00:00:00.000Z", mergedAt: "2026-05-01T00:00:00.000Z" }),
      // after week — excluded
      makePr({ number: 4, createdAt: "2026-05-02T00:00:00.000Z", mergedAt: "2026-05-04T01:00:00.000Z" }),
      // unmerged — excluded
      makePr({ number: 5, createdAt: "2026-04-27T00:00:00.000Z", mergedAt: null }),
    ];
    const ctx = makeAnalysisContext({
      prs,
      weekStart: WEEK_START,
      weekEnd: WEEK_END,
    });
    const result = compute(ctx) as DoraMetrics;
    expect(result.deploymentFrequency).toBe(2);
  });

  it("returns the empty-week DORA shape when no PRs merged in the week", () => {
    const prs = [
      makePr({ number: 1, createdAt: "2026-04-10T00:00:00.000Z", mergedAt: "2026-04-15T00:00:00.000Z" }),
      makePr({ number: 2, createdAt: "2026-05-04T01:00:00.000Z", mergedAt: "2026-05-05T00:00:00.000Z" }),
    ];
    const ctx = makeAnalysisContext({ prs, weekStart: WEEK_START, weekEnd: WEEK_END });
    const result = compute(ctx) as DoraMetrics;
    expect(result).toEqual({
      deploymentFrequency: 0,
      leadTimeForChangesHours: null,
      changeFailureRatePercent: null,
      mttrHours: null,
    });
  });

  it("includes PRs whose mergedAt is exactly at the week boundaries (closed interval)", () => {
    const prs = [
      // exactly weekStart
      makePr({ number: 1, createdAt: "2026-04-26T00:00:00.000Z", mergedAt: WEEK_START.toISOString() }),
      // exactly weekEnd
      makePr({ number: 2, createdAt: "2026-04-26T00:00:00.000Z", mergedAt: WEEK_END.toISOString() }),
    ];
    const ctx = makeAnalysisContext({ prs, weekStart: WEEK_START, weekEnd: WEEK_END });
    const result = compute(ctx) as DoraMetrics;
    expect(result.deploymentFrequency).toBe(2);
  });

  it("computes lead time median over week-merged PRs only", () => {
    const prs = [
      makePr({ number: 1, createdAt: "2026-04-27T00:00:00.000Z", mergedAt: "2026-04-28T00:00:00.000Z" }), // 24h
      makePr({ number: 2, createdAt: "2026-04-27T00:00:00.000Z", mergedAt: "2026-04-29T00:00:00.000Z" }), // 48h
      makePr({ number: 3, createdAt: "2026-04-27T00:00:00.000Z", mergedAt: "2026-05-01T00:00:00.000Z" }), // 96h
      // out-of-week — would distort the median if included
      makePr({ number: 9, createdAt: "2026-04-01T00:00:00.000Z", mergedAt: "2026-04-15T00:00:00.000Z" }),
    ];
    const ctx = makeAnalysisContext({ prs, weekStart: WEEK_START, weekEnd: WEEK_END });
    const result = compute(ctx) as DoraMetrics;
    expect(result.leadTimeForChangesHours).toBe(48); // median of [24, 48, 96]
  });

  it("changeFailureRatePercent uses week-merged PRs as denominator", () => {
    const prs = [
      makePr({ number: 1, createdAt: "2026-04-27T00:00:00.000Z", mergedAt: "2026-04-28T00:00:00.000Z" }),
      makePr({
        number: 2,
        createdAt: "2026-04-27T00:00:00.000Z",
        mergedAt: "2026-04-29T00:00:00.000Z",
        labels: [{ name: "hotfix" }],
      }),
      // out-of-week hotfix should NOT inflate numerator
      makePr({
        number: 9,
        createdAt: "2026-04-01T00:00:00.000Z",
        mergedAt: "2026-04-10T00:00:00.000Z",
        labels: [{ name: "hotfix" }],
      }),
    ];
    const ctx = makeAnalysisContext({ prs, weekStart: WEEK_START, weekEnd: WEEK_END });
    const result = compute(ctx) as DoraMetrics;
    expect(result.changeFailureRatePercent).toBe(50);
  });

  it("MTTR averages the lead time of week-merged failure-fix PRs only", () => {
    const prs = [
      makePr({
        number: 1,
        createdAt: "2026-04-27T00:00:00.000Z",
        mergedAt: "2026-04-27T04:00:00.000Z", // 4h
        labels: [{ name: "hotfix" }],
      }),
      makePr({
        number: 2,
        createdAt: "2026-04-28T00:00:00.000Z",
        mergedAt: "2026-04-28T08:00:00.000Z", // 8h
        labels: [{ name: "incident" }],
      }),
      // pre-week incident should be ignored
      makePr({
        number: 9,
        createdAt: "2026-03-01T00:00:00.000Z",
        mergedAt: "2026-03-03T00:00:00.000Z",
        labels: [{ name: "hotfix" }],
      }),
      // non-failure week-merged PR (should not affect MTTR)
      makePr({ number: 3, createdAt: "2026-04-27T00:00:00.000Z", mergedAt: "2026-04-30T00:00:00.000Z" }),
    ];
    const ctx = makeAnalysisContext({ prs, weekStart: WEEK_START, weekEnd: WEEK_END });
    const result = compute(ctx) as DoraMetrics;
    expect(result.mttrHours).toBe(6); // (4 + 8) / 2
  });

  it("respects firstReviewThresholdHours config override (does not affect DORA shape)", () => {
    const prs = [
      makePr({ number: 1, createdAt: "2026-04-27T00:00:00.000Z", mergedAt: "2026-04-29T00:00:00.000Z" }),
    ];
    const ctx = makeAnalysisContext({
      prs,
      weekStart: WEEK_START,
      weekEnd: WEEK_END,
      config: { firstReviewThresholdHours: 24 },
    });
    const result = compute(ctx) as DoraMetrics;
    expect(result.deploymentFrequency).toBe(1);
  });
});
