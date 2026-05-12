import { describe, it, expect } from "vitest";
import { buildPrTimeline, selectTimelinePrs } from "./timeline.js";
import { createBotLoginMatcher } from "../../../shared/bot.js";
import { makePr } from "../../../test-fixtures.js";

const WEEK_END = "2026-04-01T00:00:00.000Z";

describe("buildPrTimeline", () => {
  it("unmerged OPEN PR uses weekEnd as the timeline endpoint", () => {
    const pr = makePr({
      createdAt: "2026-03-30T00:00:00.000Z",
      mergedAt: null,
      closedAt: null,
    });
    const result = buildPrTimeline(pr, WEEK_END);
    expect(result.segments).toHaveLength(4);
    // No commits / no reviews → all later boundaries collapse to weekEnd
    expect(result.segments[0]!.durationHours).toBe(0);
    expect(result.segments[1]!.durationHours).toBe(48); // wait_review spans createdAt → weekEnd
    expect(result.segments[2]!.durationHours).toBe(0);
    expect(result.segments[3]!.durationHours).toBe(0);
  });

  it("CLOSED (un-merged) PR uses closedAt as the timeline endpoint", () => {
    const pr = makePr({
      createdAt: "2026-03-30T00:00:00.000Z",
      mergedAt: null,
      closedAt: "2026-03-30T12:00:00.000Z",
    });
    const result = buildPrTimeline(pr, WEEK_END);
    expect(result.segments[1]!.durationHours).toBe(12); // wait_review spans createdAt → closedAt
    expect(result.segments[3]!.endAt).toBe("2026-03-30T12:00:00.000Z");
    expect(result.auxiliary.closingState).toBe("closed_unmerged");
    expect(result.auxiliary.closedAt).toBe("2026-03-30T12:00:00.000Z");
    expect(result.auxiliary.mergedAt).toBeNull();
  });

  it("merged PR exposes closingState='merged' and timestamps in auxiliary", () => {
    const pr = makePr({
      createdAt: "2026-03-30T00:00:00.000Z",
      mergedAt: "2026-03-30T18:00:00.000Z",
      closedAt: "2026-03-30T18:00:00.000Z",
    });
    const result = buildPrTimeline(pr, WEEK_END);
    expect(result.auxiliary.closingState).toBe("merged");
    expect(result.auxiliary.mergedAt).toBe("2026-03-30T18:00:00.000Z");
  });

  it("OPEN PR exposes closingState='open' in auxiliary", () => {
    const pr = makePr({
      createdAt: "2026-03-30T00:00:00.000Z",
      mergedAt: null,
      closedAt: null,
    });
    const result = buildPrTimeline(pr, WEEK_END);
    expect(result.auxiliary.closingState).toBe("open");
    expect(result.auxiliary.mergedAt).toBeNull();
    expect(result.auxiliary.closedAt).toBeNull();
  });

  it("merged PR with no review reaction collapses into a single wait_review segment", () => {
    const pr = makePr({
      createdAt: "2026-03-30T00:00:00.000Z",
      mergedAt: "2026-03-31T00:00:00.000Z",
    });
    const result = buildPrTimeline(pr, WEEK_END);
    expect(result.segments).toHaveLength(4);
    expect(result.segments.map((s) => s.state)).toEqual([
      "implementing",
      "wait_review",
      "fixing",
      "wait_merge",
    ]);
    expect(result.segments[0]!.durationHours).toBe(0); // no commits → first commit = createdAt
    expect(result.segments[1]!.durationHours).toBe(24); // wait_review covers full duration
    expect(result.segments[2]!.durationHours).toBe(0);
    expect(result.segments[3]!.durationHours).toBe(0);
  });

  it("uses the earliest commit authoredDate as 実装中 start", () => {
    const pr = makePr({
      createdAt: "2026-03-30T00:00:00.000Z",
      mergedAt: "2026-03-30T03:00:00.000Z",
      commits: [
        {
          oid: "a",
          authoredDate: "2026-03-29T00:00:00.000Z",
          committedDate: "2026-03-30T00:00:00.000Z",
          messageHeadline: "first",
          author: "alice",
        },
        {
          oid: "b",
          authoredDate: "2026-03-29T12:00:00.000Z",
          committedDate: "2026-03-30T00:00:00.000Z",
          messageHeadline: "second",
          author: "alice",
        },
      ],
    });
    const result = buildPrTimeline(pr, WEEK_END);
    expect(result.auxiliary.firstCommitAt).toBe("2026-03-29T00:00:00.000Z");
    expect(result.segments[0]!.startAt).toBe("2026-03-29T00:00:00.000Z");
    expect(result.segments[0]!.durationHours).toBe(24); // implementing 1 day
  });

  it("draft PR uses ready_for_review as 実装中 → レビュー待ち boundary", () => {
    const pr = makePr({
      isDraft: true,
      createdAt: "2026-03-29T00:00:00.000Z",
      mergedAt: "2026-03-30T00:00:00.000Z",
      timelineEvents: [
        { type: "ready_for_review", createdAt: "2026-03-29T12:00:00.000Z" },
      ],
    });
    const result = buildPrTimeline(pr, WEEK_END);
    expect(result.auxiliary.readyForReviewAt).toBe("2026-03-29T12:00:00.000Z");
    expect(result.segments[0]!.endAt).toBe("2026-03-29T12:00:00.000Z");
    expect(result.segments[0]!.durationHours).toBe(12);
  });

  it("採用される最初のレビュー反応は bot/PR作成者を除外する", () => {
    const pr = makePr({
      author: "alice",
      createdAt: "2026-03-28T00:00:00.000Z",
      mergedAt: "2026-03-29T00:00:00.000Z",
      reviews: [
        // Bot review (excluded)
        { author: "renovate[bot]", state: "COMMENTED", submittedAt: "2026-03-28T01:00:00.000Z" },
        // PR author self-review (excluded)
        { author: "alice", state: "COMMENTED", submittedAt: "2026-03-28T02:00:00.000Z" },
        // Real reviewer (the one we should pick)
        { author: "bob", state: "COMMENTED", submittedAt: "2026-03-28T08:00:00.000Z" },
        { author: "bob", state: "APPROVED", submittedAt: "2026-03-28T20:00:00.000Z" },
      ],
    });
    const result = buildPrTimeline(pr, WEEK_END, createBotLoginMatcher(["\\[bot\\]$"]));
    expect(result.auxiliary.firstReaction).toEqual({
      at: "2026-03-28T08:00:00.000Z",
      by: "bob",
    });
    expect(result.segments[1]!.endAt).toBe("2026-03-28T08:00:00.000Z"); // wait_review ends at first reaction
    expect(result.segments[2]!.endAt).toBe("2026-03-28T20:00:00.000Z"); // fixing ends at first approve
  });

  it("マージ済み PR で bot のみコメントの場合は bot をフォールバックとして集計に含める", () => {
    const pr = makePr({
      author: "alice",
      createdAt: "2026-03-28T00:00:00.000Z",
      mergedAt: "2026-03-29T00:00:00.000Z",
      reviews: [
        { author: "coderabbitai[bot]", state: "COMMENTED", submittedAt: "2026-03-28T02:00:00.000Z" },
      ],
    });
    const result = buildPrTimeline(pr, WEEK_END, createBotLoginMatcher(["\\[bot\\]$"]));
    // bot-only reviewed merged PR → fallback includes bot
    expect(result.auxiliary.firstReaction).toEqual({
      at: "2026-03-28T02:00:00.000Z",
      by: "coderabbitai[bot]",
    });
    expect(result.auxiliary.reviewCommentCount).toBe(1);
  });

  it("マージ済み PR で human の反応があれば bot はフォールバックに使われない", () => {
    const pr = makePr({
      author: "alice",
      createdAt: "2026-03-28T00:00:00.000Z",
      mergedAt: "2026-03-29T00:00:00.000Z",
      reviews: [
        { author: "coderabbitai[bot]", state: "COMMENTED", submittedAt: "2026-03-28T01:00:00.000Z" },
        { author: "bob", state: "APPROVED", submittedAt: "2026-03-28T08:00:00.000Z" },
      ],
    });
    const result = buildPrTimeline(pr, WEEK_END, createBotLoginMatcher(["\\[bot\\]$"]));
    // human reaction exists → bot is excluded, human is first reaction
    expect(result.auxiliary.firstReaction).toEqual({
      at: "2026-03-28T08:00:00.000Z",
      by: "bob",
    });
  });

  it("未マージ PR で bot のみコメントの場合はフォールバックせず first reaction = null", () => {
    const pr = makePr({
      author: "alice",
      createdAt: "2026-03-28T00:00:00.000Z",
      mergedAt: null,
      closedAt: null,
      reviews: [
        { author: "renovate[bot]", state: "COMMENTED", submittedAt: "2026-03-28T01:00:00.000Z" },
      ],
    });
    const result = buildPrTimeline(pr, WEEK_END, createBotLoginMatcher(["\\[bot\\]$"]));
    expect(result.auxiliary.firstReaction).toBeNull();
    expect(result.auxiliary.reviewCommentCount).toBe(0);
  });

  it("bot pattern が未指定なら bot らしい login もレビュー反応として扱う", () => {
    const pr = makePr({
      author: "alice",
      createdAt: "2026-03-28T00:00:00.000Z",
      mergedAt: "2026-03-29T00:00:00.000Z",
      reviews: [
        { author: "renovate[bot]", state: "COMMENTED", submittedAt: "2026-03-28T01:00:00.000Z" },
        { author: "bob", state: "COMMENTED", submittedAt: "2026-03-28T08:00:00.000Z" },
      ],
    });
    const result = buildPrTimeline(pr, WEEK_END);
    expect(result.auxiliary.firstReaction).toEqual({
      at: "2026-03-28T01:00:00.000Z",
      by: "renovate[bot]",
    });
  });

  it("最初のレビューがいきなり approve だと レビュー修正中 が 0 秒", () => {
    const pr = makePr({
      createdAt: "2026-03-28T00:00:00.000Z",
      mergedAt: "2026-03-28T12:00:00.000Z",
      reviews: [
        { author: "bob", state: "APPROVED", submittedAt: "2026-03-28T06:00:00.000Z" },
      ],
    });
    const result = buildPrTimeline(pr, WEEK_END);
    expect(result.auxiliary.firstReaction?.at).toBe("2026-03-28T06:00:00.000Z");
    expect(result.auxiliary.firstApproveAt).toBe("2026-03-28T06:00:00.000Z");
    expect(result.segments[2]!.durationHours).toBe(0); // fixing
    expect(result.segments[3]!.durationHours).toBe(6); // wait_merge
  });

  it("dismiss → 再 approve でも firstApproveAt は最初のものを採用", () => {
    const pr = makePr({
      createdAt: "2026-03-27T00:00:00.000Z",
      mergedAt: "2026-03-29T00:00:00.000Z",
      reviews: [
        { author: "bob", state: "APPROVED", submittedAt: "2026-03-27T12:00:00.000Z" },
        { author: "bob", state: "DISMISSED", submittedAt: "2026-03-28T00:00:00.000Z" },
        { author: "carol", state: "APPROVED", submittedAt: "2026-03-28T12:00:00.000Z" },
      ],
    });
    const result = buildPrTimeline(pr, WEEK_END);
    expect(result.auxiliary.firstApproveAt).toBe("2026-03-27T12:00:00.000Z");
    expect(result.auxiliary.approveCount).toBe(2);
    expect(result.auxiliary.dismissCount).toBe(1);
    // wait_merge starts at first approve
    expect(result.segments[3]!.startAt).toBe("2026-03-27T12:00:00.000Z");
  });

  it("時系列逆転は区間 0 秒にクランプされる", () => {
    // First commit AFTER PR creation, and a stray review submitted before PR creation.
    const pr = makePr({
      createdAt: "2026-03-28T00:00:00.000Z",
      mergedAt: "2026-03-28T06:00:00.000Z",
      commits: [
        {
          oid: "a",
          authoredDate: "2026-03-28T03:00:00.000Z", // later than createdAt
          committedDate: "2026-03-28T03:00:00.000Z",
          messageHeadline: "x",
          author: "alice",
        },
      ],
      reviews: [
        // Review timestamp before first commit — would invert
        { author: "bob", state: "APPROVED", submittedAt: "2026-03-28T01:00:00.000Z" },
      ],
    });
    const result = buildPrTimeline(pr, WEEK_END);
    // boundaries: [03:00, 03:00, 03:00 (clamped from 01:00), 03:00 (clamped from 01:00), 06:00]
    expect(result.segments[0]!.durationHours).toBe(0);
    expect(result.segments[1]!.durationHours).toBe(0);
    expect(result.segments[2]!.durationHours).toBe(0);
    expect(result.segments[3]!.durationHours).toBe(3);
  });

  it("issue_comment と reviewThread コメントも 最初のレビュー反応 として拾う", () => {
    const pr = makePr({
      createdAt: "2026-03-28T00:00:00.000Z",
      mergedAt: "2026-03-29T00:00:00.000Z",
      comments: [
        { author: "bob", bodyText: "looks neat", createdAt: "2026-03-28T05:00:00.000Z", updatedAt: null, url: null },
      ],
      reviewThreads: [
        {
          isResolved: false,
          isOutdated: false,
          path: "x.ts",
          line: 10,
          startLine: null,
          comments: [
            { author: "bob", bodyText: "nit", createdAt: "2026-03-28T03:00:00.000Z", updatedAt: null, url: null, path: "x.ts", line: 10 },
          ],
        },
      ],
      reviews: [
        { author: "bob", state: "APPROVED", submittedAt: "2026-03-28T20:00:00.000Z" },
      ],
    });
    const result = buildPrTimeline(pr, WEEK_END);
    expect(result.auxiliary.firstReaction?.at).toBe("2026-03-28T03:00:00.000Z");
    expect(result.auxiliary.reviewCommentCount).toBe(3); // thread + issue + APPROVED review
  });

  it("approve 後に追加された commit を postApproveCommitCount として数える", () => {
    const pr = makePr({
      createdAt: "2026-03-28T00:00:00.000Z",
      mergedAt: "2026-03-29T00:00:00.000Z",
      reviews: [
        { author: "bob", state: "APPROVED", submittedAt: "2026-03-28T12:00:00.000Z" },
      ],
      commits: [
        { oid: "a", authoredDate: "2026-03-28T01:00:00.000Z", committedDate: "2026-03-28T01:00:00.000Z", messageHeadline: "x", author: "alice" },
        { oid: "b", authoredDate: "2026-03-28T15:00:00.000Z", committedDate: "2026-03-28T15:00:00.000Z", messageHeadline: "y", author: "alice" },
        { oid: "c", authoredDate: "2026-03-28T18:00:00.000Z", committedDate: "2026-03-28T18:00:00.000Z", messageHeadline: "z", author: "alice" },
      ],
    });
    const result = buildPrTimeline(pr, WEEK_END);
    expect(result.auxiliary.postApproveCommitCount).toBe(2);
  });
});

describe("selectTimelinePrs", () => {
  // Wide window so existing fixtures (which span the whole month) are all "active in week".
  const WIDE_START = new Date("2026-03-01T00:00:00.000Z");
  const WIDE_END = new Date(WEEK_END);

  it("includes unmerged PRs (OPEN/CLOSED) in the timeline", () => {
    const prs = [
      makePr({ number: 1, mergedAt: null, closedAt: null, createdAt: "2026-03-25T00:00:00.000Z" }),
      makePr({ number: 2, mergedAt: null, closedAt: "2026-03-26T00:00:00.000Z", createdAt: "2026-03-25T00:00:00.000Z" }),
    ];
    const result = selectTimelinePrs(prs, WIDE_START, WIDE_END);
    expect(result).toHaveLength(2);
  });

  it("returns all PRs when no limit is specified", () => {
    const prs = Array.from({ length: 15 }, (_, i) =>
      makePr({
        number: i + 1,
        createdAt: `2026-03-${String(i + 1).padStart(2, "0")}T00:00:00.000Z`,
        mergedAt: `2026-03-${String(i + 2).padStart(2, "0")}T00:00:00.000Z`,
      }),
    );
    const result = selectTimelinePrs(prs, WIDE_START, WIDE_END);
    expect(result).toHaveLength(15);
  });

  it("sorts by most recent activity (mergedAt → closedAt → createdAt) descending", () => {
    const prs = [
      makePr({ number: 1, mergedAt: "2026-03-28T00:00:00.000Z", createdAt: "2026-03-27T00:00:00.000Z" }),
      makePr({ number: 2, mergedAt: "2026-03-30T00:00:00.000Z", createdAt: "2026-03-29T00:00:00.000Z" }),
      makePr({ number: 3, mergedAt: "2026-03-29T00:00:00.000Z", createdAt: "2026-03-28T00:00:00.000Z" }),
    ];
    const result = selectTimelinePrs(prs, WIDE_START, WIDE_END, 2);
    expect(result).toHaveLength(2);
    expect(result[0]!.number).toBe(2);
    expect(result[1]!.number).toBe(3);
  });

  it("respects an explicit limit parameter", () => {
    const prs = Array.from({ length: 15 }, (_, i) =>
      makePr({
        number: i + 1,
        createdAt: `2026-03-${String(i + 1).padStart(2, "0")}T00:00:00.000Z`,
        mergedAt: `2026-03-${String(i + 2).padStart(2, "0")}T00:00:00.000Z`,
      }),
    );
    const result = selectTimelinePrs(prs, WIDE_START, WIDE_END, 5);
    expect(result).toHaveLength(5);
  });

  it("excludes PRs whose only activity is outside the week", () => {
    const weekStart = new Date("2026-03-23T00:00:00.000Z");
    const weekEnd = new Date("2026-03-29T23:59:59.999Z");
    const prs = [
      makePr({
        number: 100,
        createdAt: "2026-03-10T00:00:00.000Z",
        mergedAt: "2026-03-12T00:00:00.000Z", // pre-week, no other activity
      }),
      makePr({
        number: 200,
        createdAt: "2026-03-25T00:00:00.000Z",
        mergedAt: "2026-03-25T12:00:00.000Z", // in-week
      }),
    ];
    const result = selectTimelinePrs(prs, weekStart, weekEnd);
    expect(result).toHaveLength(1);
    expect(result[0]!.number).toBe(200);
  });
});
