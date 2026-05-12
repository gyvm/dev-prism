import { describe, it, expect } from "vitest";
import { compute } from "./compute.js";
import { ConfigError } from "../../shared/errors.js";
import { makePr, makeAnalysisContext } from "../../test-fixtures.js";

const WEEK_START = new Date("2026-04-27T00:00:00.000Z");
const WEEK_END = new Date("2026-05-03T23:59:59.999Z");

describe("pr-timeline compute (week-scoped)", () => {
  it("excludes PRs whose only activity is outside the week", () => {
    const prs = [
      // pre-week, no in-week activity
      makePr({
        number: 1,
        createdAt: "2026-04-10T00:00:00.000Z",
        mergedAt: "2026-04-15T00:00:00.000Z",
      }),
      // in-week
      makePr({
        number: 2,
        createdAt: "2026-04-27T00:00:00.000Z",
        mergedAt: "2026-04-30T00:00:00.000Z",
      }),
    ];
    const ctx = makeAnalysisContext({ prs, weekStart: WEEK_START, weekEnd: WEEK_END });
    const out = compute(ctx);
    expect(out.timelines).toHaveLength(1);
    expect(out.timelines[0]!.number).toBe(2);
  });

  it("includes PRs created before the week if a review/comment lands in-week", () => {
    const prs = [
      makePr({
        number: 10,
        createdAt: "2026-04-10T00:00:00.000Z",
        mergedAt: null,
        reviews: [
          { author: "bob", state: "COMMENTED", submittedAt: "2026-04-28T10:00:00.000Z" },
        ],
      }),
    ];
    const ctx = makeAnalysisContext({ prs, weekStart: WEEK_START, weekEnd: WEEK_END });
    const out = compute(ctx);
    expect(out.timelines).toHaveLength(1);
    expect(out.timelines[0]!.number).toBe(10);
  });

  it("includes a PR created in-week even with no other activity", () => {
    const prs = [
      makePr({ number: 11, createdAt: "2026-04-28T00:00:00.000Z", mergedAt: null }),
    ];
    const ctx = makeAnalysisContext({ prs, weekStart: WEEK_START, weekEnd: WEEK_END });
    const out = compute(ctx);
    expect(out.timelines).toHaveLength(1);
  });

  it("includes a PR merged exactly at weekEnd (closed interval)", () => {
    const prs = [
      makePr({
        number: 12,
        createdAt: "2026-04-26T00:00:00.000Z",
        mergedAt: WEEK_END.toISOString(),
      }),
    ];
    const ctx = makeAnalysisContext({ prs, weekStart: WEEK_START, weekEnd: WEEK_END });
    const out = compute(ctx);
    expect(out.timelines).toHaveLength(1);
  });

  it("respects the limit config and orders by most recent activity", () => {
    const prs = [
      makePr({ number: 1, createdAt: "2026-04-27T00:00:00.000Z", mergedAt: "2026-04-28T00:00:00.000Z" }),
      makePr({ number: 2, createdAt: "2026-04-27T00:00:00.000Z", mergedAt: "2026-04-30T00:00:00.000Z" }),
      makePr({ number: 3, createdAt: "2026-04-27T00:00:00.000Z", mergedAt: "2026-04-29T00:00:00.000Z" }),
    ];
    const ctx = makeAnalysisContext({
      prs,
      weekStart: WEEK_START,
      weekEnd: WEEK_END,
      config: { limit: 2 },
    });
    const out = compute(ctx);
    expect(out.timelines).toHaveLength(2);
    expect(out.timelines[0]!.number).toBe(2);
    expect(out.timelines[1]!.number).toBe(3);
  });

  it("throws ConfigError when limit is not a number", () => {
    const ctx = makeAnalysisContext({
      prs: [],
      weekStart: WEEK_START,
      weekEnd: WEEK_END,
      config: { limit: "50" },
    });
    expect(() => compute(ctx)).toThrow(ConfigError);
  });

  it("throws ConfigError when limit is negative", () => {
    const ctx = makeAnalysisContext({
      prs: [],
      weekStart: WEEK_START,
      weekEnd: WEEK_END,
      config: { limit: -1 },
    });
    expect(() => compute(ctx)).toThrow(ConfigError);
  });

  it("propagates weekStart/weekEnd/timezone to the output payload", () => {
    const ctx = makeAnalysisContext({
      prs: [],
      weekStart: WEEK_START,
      weekEnd: WEEK_END,
      timezone: "Asia/Tokyo",
    });
    const out = compute(ctx);
    expect(out.weekStart).toBe(WEEK_START.toISOString());
    expect(out.weekEnd).toBe(WEEK_END.toISOString());
    expect(out.timezone).toBe("Asia/Tokyo");
  });
});
