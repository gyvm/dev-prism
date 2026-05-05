import { describe, expect, it } from "vitest";

import { renderGanttChart } from "./gantt-chart.js";
import type { TimelineAuxiliary } from "../shared/types.js";


const EMPTY_AUX: TimelineAuxiliary = {
  firstCommitAt: null,
  readyForReviewAt: null,
  firstReaction: null,
  firstApproveAt: null,
  approveCount: 0,
  dismissCount: 0,
  reviewCommentCount: 0,
  postApproveCommitCount: 0,
  closingState: "open",
  mergedAt: null,
  closedAt: null,
};

describe("renderGanttChart", () => {
  it("renders PR authors, repositories, and timeline filter hover hooks", () => {
    const result = {
      kind: "chart",
      skillId: "pr-timeline",
      renderer: "gantt-chart",
      data: {
        weekStart: "2026-04-27T00:00:00.000Z",
        weekEnd: "2026-05-03T23:59:59.999Z",
        timezone: "Asia/Tokyo",
        timelines: [
          {
            repo: { owner: "test", name: "repo" },
            number: 1,
            title: "Authored PR",
            author: "alice",
            totalDurationHours: 24,
            segments: [
              {
                state: "wait_review",
                startAt: "2026-04-28T00:00:00.000Z",
                endAt: "2026-04-29T00:00:00.000Z",
                durationHours: 24,
              },
            ],
            auxiliary: EMPTY_AUX,
          },
          {
            repo: { owner: "test\"org", name: "repo&api" },
            number: 2,
            title: "Escaped author",
            author: "bob\"dev",
            totalDurationHours: 12,
            segments: [
              {
                state: "fixing",
                startAt: "2026-04-30T00:00:00.000Z",
                endAt: "2026-04-30T12:00:00.000Z",
                durationHours: 12,
              },
            ],
            auxiliary: EMPTY_AUX,
          },
          {
            repo: { owner: "test", name: "repo" },
            number: 3,
            title: "Unknown author PR",
            author: null,
            totalDurationHours: 12,
            segments: [
              {
                state: "wait_merge",
                startAt: "2026-05-01T00:00:00.000Z",
                endAt: "2026-05-01T12:00:00.000Z",
                durationHours: 12,
              },
            ],
            auxiliary: EMPTY_AUX,
          },
        ],
      },
    };

    const html = renderGanttChart(result.data);

    expect(html).toContain('data-component="timeline"');
    expect(html).toContain('class="timeline-row" data-repo="test/repo" data-author="alice"');
    expect(html).toContain('<span class="pr-title-line"><a class="pr-title" href="https://github.com/test/repo/pull/1" target="_blank" rel="noopener">Authored PR</a><span class="pr-author-prefix">by</span><span class="pr-author" data-author="alice">@alice</span></span>');
    expect(html).toContain('<span class="pr-ref" data-repo="test/repo">test/repo#1</span>');
    expect(html).toContain('data-repo="test&quot;org/repo&amp;api"');
    expect(html).toContain('Escaped author</a><span class="pr-author-prefix">by</span>');
    expect(html).toContain('test&quot;org/repo&amp;api#2</span>');
    expect(html).toContain('data-author="bob&quot;dev"');
    expect(html).toContain('@bob&quot;dev</span>');
    expect(html).toContain('Unknown author PR</a><span class="pr-author-prefix">by</span><span class="pr-author">作成者不明</span>');
    expect(html).toContain("data-hovered-filter");
    expect(html).toContain("timeline-filter-active");
    expect(html).toContain("activateFilter('repo', repo)");
    expect(html).toContain(".pr-ref[data-repo]");
  });

  it("renders 4 legend items (in_review removed)", () => {
    const result = {
      kind: "chart",
      skillId: "pr-timeline",
      renderer: "gantt-chart",
      data: {
        weekStart: "2026-04-27T00:00:00.000Z",
        weekEnd: "2026-05-03T23:59:59.999Z",
        timezone: "Asia/Tokyo",
        timelines: [
          {
            repo: { owner: "test", name: "repo" },
            number: 10,
            title: "PR",
            author: "alice",
            totalDurationHours: 1,
            segments: [
              {
                state: "implementing",
                startAt: "2026-04-28T00:00:00.000Z",
                endAt: "2026-04-28T01:00:00.000Z",
                durationHours: 1,
              },
            ],
            auxiliary: EMPTY_AUX,
          },
        ],
      },
    };
    const html = renderGanttChart(result.data);
    expect(html).toContain("実装中");
    expect(html).toContain("レビュー待ち");
    expect(html).toContain("レビュー修正中");
    expect(html).toContain("マージ待ち");
    expect(html).not.toContain(">レビュー中<");
  });

  it("renders immediate timeline tooltip data without native title tooltips", () => {
    const result = {
      kind: "chart",
      skillId: "pr-timeline",
      renderer: "gantt-chart",
      data: {
        weekStart: "2026-04-27T00:00:00.000Z",
        weekEnd: "2026-05-03T23:59:59.999Z",
        timezone: "Asia/Tokyo",
        timelines: [
          {
            repo: { owner: "test", name: "repo" },
            number: 4,
            title: "Detailed tooltip PR",
            author: "carol",
            totalDurationHours: 3.2,
            segments: [
              {
                state: "wait_review",
                startAt: "2026-05-01T00:00:00.000Z",
                endAt: "2026-05-01T00:42:00.000Z",
                durationHours: 0.7,
              },
              {
                state: "fixing",
                startAt: "2026-05-01T14:40:00.000Z",
                endAt: "2026-05-01T15:25:00.000Z",
                durationHours: 0.75,
              },
              {
                state: "wait_merge",
                startAt: "2026-05-01T16:00:00.000Z",
                endAt: "2026-05-01T18:30:00.000Z",
                durationHours: 2.5,
              },
            ],
            auxiliary: EMPTY_AUX,
          },
        ],
      },
    };

    const html = renderGanttChart(result.data);

    expect(html).not.toContain(" title=");
    expect(html).toContain('data-state="wait_review"');
    expect(html).toContain('data-start="2026-05-01T00:00:00.000Z"');
    expect(html).toContain('data-end="2026-05-01T00:42:00.000Z"');
    expect(html).toContain('data-duration-minutes="42"');
    expect(html).toContain("09:00 - 09:42 / 42分 / レビュー待ち");
    expect(html).toContain("5/1 23:40 - 5/2 00:25 / 45分 / レビュー修正中");
    expect(html).toContain("150分 (2h30m) / マージ待ち");
    expect(html).toContain("timeline-tooltip");
    expect(html).toContain("showTrackTooltip");
  });

  it("embeds auxiliary data as data-aux JSON for tooltip", () => {
    const result = {
      kind: "chart",
      skillId: "pr-timeline",
      renderer: "gantt-chart",
      data: {
        weekStart: "2026-04-27T00:00:00.000Z",
        weekEnd: "2026-05-03T23:59:59.999Z",
        timezone: "Asia/Tokyo",
        timelines: [
          {
            repo: { owner: "test", name: "repo" },
            number: 99,
            title: "Aux PR",
            author: "dan",
            totalDurationHours: 10,
            segments: [
              {
                state: "wait_merge",
                startAt: "2026-05-01T00:00:00.000Z",
                endAt: "2026-05-01T10:00:00.000Z",
                durationHours: 10,
              },
            ],
            auxiliary: {
              firstCommitAt: "2026-04-30T22:00:00.000Z",
              readyForReviewAt: "2026-04-30T23:00:00.000Z",
              firstReaction: { at: "2026-04-30T23:30:00.000Z", by: "eve" },
              firstApproveAt: "2026-05-01T00:00:00.000Z",
              approveCount: 2,
              dismissCount: 1,
              reviewCommentCount: 4,
              postApproveCommitCount: 0,
              closingState: "merged",
              mergedAt: "2026-05-01T10:00:00.000Z",
              closedAt: "2026-05-01T10:00:00.000Z",
            },
          },
        ],
      },
    };
    const html = renderGanttChart(result.data);
    expect(html).toContain("data-aux=");
    expect(html).toContain("最初のコミット");
    expect(html).toContain("最初のレビュー反応");
    expect(html).toContain("レビュー依頼時刻");
    expect(html).toContain("最初の承認");
    expect(html).toContain("承認回数");
    expect(html).toContain("レビュー反応数");
    expect(html).toContain("承認後の追加コミット");
    expect(html).toContain("マージ済み");
    expect(html).not.toContain("ready_for_review");
    expect(html).not.toContain("最初のapprove");
    expect(html).toContain("buildAuxHtml");
  });

  it("marks closed-but-unmerged PR with data-closed-unmerged and shows status", () => {
    const result = {
      kind: "chart",
      skillId: "pr-timeline",
      renderer: "gantt-chart",
      data: {
        weekStart: "2026-04-27T00:00:00.000Z",
        weekEnd: "2026-05-03T23:59:59.999Z",
        timezone: "Asia/Tokyo",
        timelines: [
          {
            repo: { owner: "test", name: "repo" },
            number: 508,
            title: "Closed unmerged PR",
            author: "carol",
            totalDurationHours: 24,
            segments: [
              {
                state: "wait_review",
                startAt: "2026-05-01T00:00:00.000Z",
                endAt: "2026-05-02T00:00:00.000Z",
                durationHours: 24,
              },
            ],
            auxiliary: {
              ...EMPTY_AUX,
              closingState: "closed_unmerged",
              closedAt: "2026-05-02T15:00:00.000Z",
            },
          },
        ],
      },
    };
    const html = renderGanttChart(result.data);
    expect(html).toContain('data-closed-unmerged="true"');
    expect(html).toContain("クローズ");
    expect(html).toContain("※未マージ");
    expect(html).toContain("クローズ (未マージ)");
  });
});
