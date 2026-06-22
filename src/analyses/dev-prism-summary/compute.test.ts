import { describe, expect, it } from "vitest";

import { makeAnalysisContext, makePr } from "../../test-fixtures.js";
import { analystComment, compute } from "./compute.js";

describe("dev-prism-summary compute", () => {
  it("builds a weekly flow snapshot and PR candidates", () => {
    const ctx = makeAnalysisContext({
      weekStart: new Date("2026-04-27T00:00:00.000Z"),
      weekEnd: new Date("2026-05-03T23:59:59.999Z"),
      prs: [
        makePr({
          number: 1,
          title: "Long lead time",
          createdAt: "2026-04-27T00:00:00.000Z",
          updatedAt: "2026-05-02T00:00:00.000Z",
          mergedAt: "2026-05-02T00:00:00.000Z",
          additions: 600,
          deletions: 50,
          reviews: [{ author: "bob", state: "APPROVED", submittedAt: "2026-04-30T00:00:00.000Z" }],
          comments: [{ author: "carol", bodyText: "Let's discuss", createdAt: "2026-04-29T00:00:00.000Z", updatedAt: null, url: null }],
        }),
        makePr({
          number: 2,
          title: "Quick fix",
          createdAt: "2026-05-01T00:00:00.000Z",
          updatedAt: "2026-05-01T04:00:00.000Z",
          mergedAt: "2026-05-01T04:00:00.000Z",
          additions: 12,
          deletions: 4,
          reviews: [{ author: "bob", state: "APPROVED", submittedAt: "2026-05-01T02:00:00.000Z" }],
        }),
        makePr({
          number: 3,
          title: "Needs follow up",
          createdAt: "2026-04-20T00:00:00.000Z",
          updatedAt: "2026-04-28T00:00:00.000Z",
          reviewThreads: [
            {
              isResolved: false,
              isOutdated: false,
              path: "src/a.ts",
              line: 1,
              startLine: null,
              comments: [{ author: "bob", bodyText: "Needs change", createdAt: "2026-04-28T00:00:00.000Z", updatedAt: null, url: null, path: "src/a.ts", line: 1 }],
            },
          ],
        }),
        makePr({
          number: 4,
          title: "Previous period",
          createdAt: "2026-04-21T00:00:00.000Z",
          updatedAt: "2026-04-22T00:00:00.000Z",
          mergedAt: "2026-04-22T00:00:00.000Z",
          additions: 40,
          deletions: 10,
          reviews: [{ author: "bob", state: "APPROVED", submittedAt: "2026-04-21T10:00:00.000Z" }],
        }),
      ],
    });

    const summary = compute(ctx);

    expect(summary.flowSnapshot.mergedPrCount).toBe(2);
    expect(summary.flowSnapshot.previousMergedPrCount).toBe(1);
    expect(summary.flowSnapshot.mergedPrDelta).toBe(1);
    expect(summary.flowSnapshot.previousLeadTimeHours).toBe(24);
    expect(summary.flowSnapshot.leadTimeDeltaHours).toBe(38);
    expect(summary.flowSnapshot.activePrCount).toBe(3);
    expect(summary.whatChanged.longLeadTimePrs[0]?.number).toBe(1);
    expect(summary.rememberThisWeek.quickWins[0]?.number).toBe(2);
    expect(summary.needsFollowUp.staleOpenPrs[0]?.number).toBe(3);
    expect(summary.needsFollowUp.unresolvedReviewPrs[0]?.number).toBe(3);
  });

  it("emits an empty summary (no analystComment crash) when there is no activity", () => {
    const ctx = makeAnalysisContext({ prs: [] });
    const summary = compute(ctx);
    expect(summary.flowSnapshot.mergedPrCount).toBe(0);
    expect(summary.flowSnapshot.activePrCount).toBe(0);
    expect(summary.flowSnapshot.leadTimeHours).toBeNull();
    expect(summary.flowSnapshot.analystComment).toContain("PR活動がなく");
  });
});

describe("dev-prism-summary analystComment branches", () => {
  it("no merges and no activity → no material to judge", () => {
    expect(analystComment(null, null, null, 0, 0)).toContain("PR活動がなく");
  });

  it("no merges but open activity → prioritise stalled PRs", () => {
    const text = analystComment(null, null, 30, 0, 4);
    expect(text).toContain("マージがないため");
  });

  it("heavy lead time (≥72h) → flags it as heavy", () => {
    expect(analystComment(80, 5, 10, 3, 5)).toContain("重め");
  });

  it("lead time exactly at the 72h boundary is heavy", () => {
    expect(analystComment(72, null, 10, 1, 1)).toContain("重め");
    expect(analystComment(71.9, null, 10, 1, 1)).not.toContain("重め");
  });

  it("acceptable lead but review wait ≥24h → flags review wait", () => {
    const text = analystComment(20, null, 24, 3, 5);
    expect(text).toContain("初回レビュー");
    expect(text).not.toContain("重め");
  });

  it("review wait just under 24h falls through to the healthy default", () => {
    const text = analystComment(20, null, 23.9, 3, 5);
    expect(text).not.toContain("初回レビュー");
    expect(text).toContain("流れが良かった");
  });

  it("healthy flow → highlights what worked", () => {
    expect(analystComment(10, -2, 5, 4, 6)).toContain("流れが良かった");
  });

  it("renders the previous-period delta only when present", () => {
    expect(analystComment(10, null, 5, 4, 6)).not.toContain("前回比");
    expect(analystComment(10, -3, 5, 4, 6)).toContain("前回比");
  });
});
