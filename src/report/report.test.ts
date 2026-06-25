import { describe, expect, it } from "vitest";

import { renderReportHtml } from "../pipeline/stages/render.js";
import { buildReportInput } from "./projection.js";
import { hasPrActivityInWeek, selectActiveWeekPrs } from "../shared/week.js";
import { makePr } from "../test-fixtures.js";

describe("report week selection", () => {
  const weekStart = new Date("2026-04-20T00:00:00.000Z");
  const weekEnd = new Date("2026-04-26T23:59:59.999Z");

  it("includes PRs with any week activity", () => {
    const createdEarlierReviewedInWeek = makePr({
      createdAt: "2026-04-10T00:00:00.000Z",
      reviews: [
        { author: "bob", state: "APPROVED", submittedAt: "2026-04-21T00:00:00.000Z" },
      ],
    });
    const commentInWeek = makePr({
      number: 2,
      createdAt: "2026-04-10T00:00:00.000Z",
      comments: [
        {
          author: "carol",
          bodyText: "TODO after merge",
          createdAt: "2026-04-22T00:00:00.000Z",
          updatedAt: null,
          url: null,
        },
      ],
    });
    const noActivity = makePr({
      number: 3,
      createdAt: "2026-04-01T00:00:00.000Z",
      reviews: [],
    });

    expect(hasPrActivityInWeek(createdEarlierReviewedInWeek, weekStart, weekEnd)).toBe(true);
    expect(hasPrActivityInWeek(commentInWeek, weekStart, weekEnd)).toBe(true);
    expect(hasPrActivityInWeek(noActivity, weekStart, weekEnd)).toBe(false);
    expect(selectActiveWeekPrs([createdEarlierReviewedInWeek, commentInWeek, noActivity], weekStart, weekEnd, 10)).toHaveLength(2);
  });
});

describe("report projection", () => {
  it("applies caps and keeps truncation metadata", () => {
    const input = buildReportInput({
      pullRequests: [
        makePr({
          number: 10,
          title: "Report PR",
          bodyText: "x".repeat(20),
          url: "https://github.com/test/repo/pull/10",
          createdAt: "2026-04-20T01:00:00.000Z",
          mergedAt: "2026-04-21T01:00:00.000Z",
          comments: [
            {
              author: "bob",
              bodyText: "This needs follow up documentation.",
              createdAt: "2026-04-20T03:00:00.000Z",
              updatedAt: null,
              url: null,
            },
            {
              author: "carol",
              bodyText: "Second comment",
              createdAt: "2026-04-20T04:00:00.000Z",
              updatedAt: null,
              url: null,
            },
          ],
          files: [
            { path: "a.ts", additions: 1, deletions: 0, changeType: "ADDED" },
            { path: "b.ts", additions: 1, deletions: 0, changeType: "ADDED" },
          ],
          commits: [
            {
              oid: "abc",
              committedDate: "2026-04-19T23:00:00.000Z",
              authoredDate: "2026-04-19T23:00:00.000Z",
              messageHeadline: "Start work",
              author: "alice",
            },
          ],
        }),
      ],
      generatedAt: new Date("2026-04-22T00:00:00.000Z"),
      timezone: "UTC",
      weekStart: new Date("2026-04-20T00:00:00.000Z"),
      weekEnd: new Date("2026-04-26T23:59:59.999Z"),
      limits: {
        maxPrs: 10,
        maxCommentsPerPr: 1,
        maxReviewThreadsPerPr: 10,
        maxFilesPerPr: 1,
        maxCommitsPerPr: 10,
        maxBodyLength: 10,
      },
    });

    expect(input.prs[0]?.comments).toHaveLength(1);
    expect(input.prs[0]?.files).toHaveLength(1);
    expect(input.prs[0]?.bodyText).toContain("[truncated");
    expect(input.prs[0]?.truncation).toEqual([
      "PR comments truncated to 1",
      "Changed files truncated to 1",
    ]);
  });
});

describe("report rendering", () => {
  it("renders readable header metadata in the report timezone", () => {
    const reportInput = buildReportInput({
      pullRequests: [],
      generatedAt: new Date("2026-05-05T07:41:26.290Z"),
      timezone: "Asia/Tokyo",
      weekStart: new Date("2026-04-27T00:00:00.000Z"),
      weekEnd: new Date("2026-05-03T23:59:59.999Z"),
      limits: {
        maxPrs: 10,
        maxCommentsPerPr: 10,
        maxReviewThreadsPerPr: 10,
        maxFilesPerPr: 10,
        maxCommitsPerPr: 10,
        maxBodyLength: 100,
      },
    });

    const html = renderReportHtml(
      {
        id: "2026-05-03",
        start: new Date("2026-04-27T00:00:00.000Z"),
        end: new Date("2026-05-03T23:59:59.999Z"),
      },
      reportInput,
      [],
    );

    expect(html).toContain("対象期間");
    expect(html).toContain("Dev Prism");
    expect(html).toContain("PRからチームの開発フローを映し出す週次振り返りレポート");
    expect(html).toContain("2026年4月27日(月) - 2026年5月3日(日)");
    expect(html).toContain("タイムゾーン");
    expect(html).toContain("Asia/Tokyo");
    expect(html).toContain("生成日時");
    expect(html).toContain("2026年5月5日(火) 16:41");
    expect(html).not.toContain("2026-05-05T07:41:26.290Z");
  });

  it("lays out the three bands in order and owns AI section titles", () => {
    const reportInput = buildReportInput({
      pullRequests: [],
      generatedAt: new Date("2026-05-05T07:41:26.290Z"),
      timezone: "UTC",
      weekStart: new Date("2026-04-27T00:00:00.000Z"),
      weekEnd: new Date("2026-05-03T23:59:59.999Z"),
      limits: {
        maxPrs: 10,
        maxCommentsPerPr: 10,
        maxReviewThreadsPerPr: 10,
        maxFilesPerPr: 10,
        maxCommitsPerPr: 10,
        maxBodyLength: 100,
      },
    });

    const html = renderReportHtml(
      {
        id: "2026-05-03",
        start: new Date("2026-04-27T00:00:00.000Z"),
        end: new Date("2026-05-03T23:59:59.999Z"),
      },
      reportInput,
      [
        {
          id: "dora-metrics",
          format: "json",
          renderer: "metric-cards",
          status: "ok",
          data: {
            deploymentFrequency: 5,
            leadTimeForChangesHours: 12,
            changeFailureRatePercent: null,
            mttrHours: null,
          },
        },
        {
          id: "flow-analyst",
          format: "markdown",
          status: "ok",
          data: "## Flow Analyst\n\n今週は流れが軽かったです。",
        },
        {
          id: "review-correlation",
          format: "json",
          renderer: "bipartite-graph",
          status: "ok",
          data: { authors: [], reviewers: [], links: [] },
        },
      ],
    );

    // Bands appear in the ADR 0001 order: 開発メトリクス → 開発内容の要約 → PRレビュー
    const metricsAt = html.indexOf("開発メトリクス");
    const summaryAt = html.indexOf("開発内容の要約");
    const reviewAt = html.indexOf("PRレビュー");
    expect(metricsAt).toBeGreaterThan(-1);
    expect(reviewAt).toBeGreaterThan(-1);
    expect(metricsAt).toBeLessThan(reviewAt);
    // Empty band (開発内容の要約 has no blocks here) is dropped.
    expect(summaryAt).toBe(-1);
    // Render owns the AI title (from AI_REGISTRY), and the prompt's own leading
    // H2 (`## Flow Analyst`) is stripped — so the fixed title shows, not the
    // prompt's heading text.
    expect(html).toContain('<h2 class="ai-section-title">その数字に効いたPR</h2>');
    expect(html).toContain("今週は流れが軽かったです。");
    expect(html).not.toContain("Flow Analyst");
  });
});
