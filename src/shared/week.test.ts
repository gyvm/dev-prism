import { describe, it, expect } from "vitest";
import {
  hasPrActivityInWeek,
  isMergedInWeek,
  selectActiveWeekPrs,
} from "./week.js";
import { getWeekBoundaries } from "./timezone.js";
import { MetricsError } from "./errors.js";
import { makePr } from "../test-fixtures.js";

const WEEK_START = new Date("2026-04-27T00:00:00.000Z");
const WEEK_END = new Date("2026-05-03T23:59:59.999Z");

describe("isMergedInWeek", () => {
  it("includes a PR merged exactly at weekStart (closed interval)", () => {
    const pr = makePr({ mergedAt: WEEK_START.toISOString() });
    expect(isMergedInWeek(pr, WEEK_START, WEEK_END)).toBe(true);
  });

  it("includes a PR merged exactly at weekEnd (closed interval)", () => {
    const pr = makePr({ mergedAt: WEEK_END.toISOString() });
    expect(isMergedInWeek(pr, WEEK_START, WEEK_END)).toBe(true);
  });

  it("excludes a PR merged 1ms before weekStart", () => {
    const pr = makePr({ mergedAt: "2026-04-26T23:59:59.999Z" });
    expect(isMergedInWeek(pr, WEEK_START, WEEK_END)).toBe(false);
  });

  it("excludes a PR merged 1ms after weekEnd", () => {
    const pr = makePr({ mergedAt: "2026-05-04T00:00:00.000Z" });
    expect(isMergedInWeek(pr, WEEK_START, WEEK_END)).toBe(false);
  });

  it("excludes an unmerged PR", () => {
    const pr = makePr({ mergedAt: null });
    expect(isMergedInWeek(pr, WEEK_START, WEEK_END)).toBe(false);
  });

  it("throws MetricsError on an invalid mergedAt string", () => {
    const pr = makePr({ mergedAt: "not-a-date" });
    expect(() => isMergedInWeek(pr, WEEK_START, WEEK_END)).toThrow(
      MetricsError,
    );
  });

  it("respects JST week boundaries — a PR merged at 2026-04-26T15:00Z (= 2026-04-27 00:00 JST) belongs to the JST week starting 4/27", () => {
    const jstWeek = getWeekBoundaries(
      new Date("2026-04-28T00:00:00.000Z"),
      "Asia/Tokyo",
    );
    const pr = makePr({ mergedAt: "2026-04-26T15:00:00.000Z" });
    expect(isMergedInWeek(pr, jstWeek.start, jstWeek.end)).toBe(true);
  });

  it("respects JST week boundaries — a PR merged at 2026-05-03T15:00Z (= 2026-05-04 00:00 JST, next week) is excluded", () => {
    const jstWeek = getWeekBoundaries(
      new Date("2026-04-28T00:00:00.000Z"),
      "Asia/Tokyo",
    );
    const pr = makePr({ mergedAt: "2026-05-03T15:00:00.000Z" });
    expect(isMergedInWeek(pr, jstWeek.start, jstWeek.end)).toBe(false);
  });
});

describe("hasPrActivityInWeek", () => {
  const outside = "2026-04-10T00:00:00.000Z";
  const inside = "2026-04-28T10:00:00.000Z";

  it("returns false when every signal is outside the week", () => {
    const pr = makePr({ createdAt: outside, mergedAt: null, closedAt: null });
    expect(hasPrActivityInWeek(pr, WEEK_START, WEEK_END)).toBe(false);
  });

  it.each([
    ["createdAt", (v: string) => ({ createdAt: v })],
    ["mergedAt", (v: string) => ({ mergedAt: v })],
    ["closedAt", (v: string) => ({ closedAt: v })],
    [
      "reviews.submittedAt",
      (v: string) => ({
        reviews: [{ author: "bob", state: "COMMENTED" as const, submittedAt: v }],
      }),
    ],
    [
      "timelineEvents.createdAt",
      (v: string) => ({
        timelineEvents: [{ type: "ready_for_review" as const, createdAt: v }],
      }),
    ],
    [
      "comments.createdAt",
      (v: string) => ({
        comments: [
          {
            author: "bob",
            bodyText: "hi",
            createdAt: v,
            updatedAt: null,
            url: null,
          },
        ],
      }),
    ],
    [
      "reviewThreads.comments.createdAt",
      (v: string) => ({
        reviewThreads: [
          {
            isResolved: false,
            isOutdated: false,
            path: "f.ts",
            line: 1,
            startLine: null,
            comments: [
              {
                author: "bob",
                bodyText: "nit",
                createdAt: v,
                updatedAt: null,
                url: null,
                path: "f.ts",
                line: 1,
              },
            ],
          },
        ],
      }),
    ],
  ])("returns true when in-week activity comes via %s", (_label, build) => {
    const pr = makePr({
      createdAt: outside,
      mergedAt: null,
      closedAt: null,
      ...build(inside),
    });
    expect(hasPrActivityInWeek(pr, WEEK_START, WEEK_END)).toBe(true);
  });

  it("throws MetricsError on an invalid review timestamp", () => {
    const pr = makePr({
      createdAt: outside,
      reviews: [{ author: "bob", state: "COMMENTED", submittedAt: "garbage" }],
    });
    expect(() => hasPrActivityInWeek(pr, WEEK_START, WEEK_END)).toThrow(
      MetricsError,
    );
  });
});

describe("selectActiveWeekPrs", () => {
  it("drops PRs with no in-week activity", () => {
    const prs = [
      makePr({ number: 1, createdAt: "2026-04-10T00:00:00.000Z", mergedAt: "2026-04-15T00:00:00.000Z" }),
      makePr({ number: 2, createdAt: "2026-04-28T00:00:00.000Z", mergedAt: "2026-04-30T00:00:00.000Z" }),
    ];
    const result = selectActiveWeekPrs(prs, WEEK_START, WEEK_END, 10);
    expect(result.map((p) => p.number)).toEqual([2]);
  });

  it("sorts by mergedAt ?? closedAt ?? createdAt descending", () => {
    const prs = [
      makePr({ number: 1, createdAt: "2026-04-27T00:00:00.000Z", mergedAt: "2026-04-28T00:00:00.000Z" }),
      makePr({ number: 2, createdAt: "2026-04-27T00:00:00.000Z", mergedAt: "2026-04-30T00:00:00.000Z" }),
      makePr({ number: 3, createdAt: "2026-04-27T00:00:00.000Z", mergedAt: "2026-04-29T00:00:00.000Z" }),
    ];
    const result = selectActiveWeekPrs(prs, WEEK_START, WEEK_END, 10);
    expect(result.map((p) => p.number)).toEqual([2, 3, 1]);
  });

  it("applies the limit after sorting", () => {
    const prs = Array.from({ length: 5 }, (_, i) =>
      makePr({
        number: i + 1,
        createdAt: "2026-04-27T00:00:00.000Z",
        mergedAt: `2026-04-${String(27 + i).padStart(2, "0")}T00:00:00.000Z`,
      }),
    );
    const result = selectActiveWeekPrs(prs, WEEK_START, WEEK_END, 2);
    expect(result).toHaveLength(2);
    expect(result[0]!.number).toBe(5);
    expect(result[1]!.number).toBe(4);
  });
});
