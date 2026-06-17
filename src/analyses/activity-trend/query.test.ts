import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { makePr } from "../../test-fixtures.js";
import type { NormalizedActor, NormalizedPullRequest } from "../../shared/types.js";
import { buildDwhFromPullRequests } from "../../warehouse/build.js";
import { withDwh } from "../../warehouse/query.js";
import { resolveScope } from "../scope.js";
import { queryActivityTrend } from "./query.js";

const alice: NormalizedActor = {
  sourceNodeId: "U_alice", type: "User", login: "alice", slug: null, name: "Alice", url: null,
};
const bot: NormalizedActor = {
  sourceNodeId: "U_bot", type: "Bot", login: "renovate[bot]", slug: null, name: "renovate", url: null,
};

function pr(num: number, opts: {
  created: string;
  merged?: string | null;
  author?: NormalizedActor;
  reviews?: NormalizedPullRequest["reviews"];
  comments?: NormalizedPullRequest["comments"];
}): NormalizedPullRequest {
  return makePr({
    repo: { owner: "openai", name: "codex", sourceNodeId: "R_1", visibility: "PRIVATE" },
    sourceNodeId: `PR_${num}`,
    number: num,
    title: `PR ${num}`,
    author: (opts.author ?? alice).login,
    authorActor: opts.author ?? alice,
    createdAt: opts.created,
    updatedAt: opts.merged ?? opts.created,
    mergedAt: opts.merged ?? null,
    additions: 1,
    deletions: 0,
    reviews: opts.reviews ?? [],
    comments: opts.comments ?? [],
  });
}

describe("queryActivityTrend", () => {
  it("buckets PR/review/comment counts by week", async () => {
    const prs = [
      pr(1, {
        created: "2026-04-20T00:00:00.000Z", // week of 2026-04-20 (Mon)
        merged: "2026-04-21T00:00:00.000Z",
        reviews: [{ author: "alice", authorActor: alice, state: "APPROVED", submittedAt: "2026-04-20T10:00:00.000Z" }],
        comments: [{ author: "alice", authorActor: alice, bodyText: "hi", createdAt: "2026-04-20T11:00:00.000Z", updatedAt: null, url: null }],
      }),
      pr(2, {
        created: "2026-04-28T00:00:00.000Z", // next week
      }),
    ];

    const root = await mkdtemp(join(tmpdir(), "gh-insights-trend-"));
    const dwhDir = join(root, "dwh");
    try {
      await buildDwhFromPullRequests(prs, { dwhDir, botPatterns: [] });
      const trend = await withDwh(dwhDir, (runner) =>
        queryActivityTrend(runner, resolveScope({ grain: "week" })),
      );

      expect(trend.grain).toBe("week");
      expect(trend.buckets).toEqual([
        { bucket: "2026-04-20T00:00:00.000Z", prOpened: 1, prMerged: 1, reviews: 1, comments: 1 },
        { bucket: "2026-04-27T00:00:00.000Z", prOpened: 1, prMerged: 0, reviews: 0, comments: 0 },
      ]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("excludes bot activity when includeBots is false", async () => {
    const prs = [
      pr(1, { created: "2026-04-20T00:00:00.000Z", author: alice }),
      pr(2, { created: "2026-04-20T02:00:00.000Z", author: bot }),
    ];

    const root = await mkdtemp(join(tmpdir(), "gh-insights-trend-"));
    const dwhDir = join(root, "dwh");
    try {
      await buildDwhFromPullRequests(prs, { dwhDir, botPatterns: ["\\[bot\\]$"] });

      const withBots = await withDwh(dwhDir, (runner) =>
        queryActivityTrend(runner, resolveScope({ grain: "week", includeBots: true })),
      );
      expect(withBots.buckets[0]?.prOpened).toBe(2);

      const withoutBots = await withDwh(dwhDir, (runner) =>
        queryActivityTrend(runner, resolveScope({ grain: "week", includeBots: false })),
      );
      expect(withoutBots.buckets[0]?.prOpened).toBe(1);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("excludes bot reviews and comments (not just PRs) when includeBots is false", async () => {
    const prs = [
      pr(1, {
        created: "2026-04-20T00:00:00.000Z",
        author: alice,
        reviews: [{ author: "renovate[bot]", authorActor: bot, state: "COMMENTED", submittedAt: "2026-04-20T10:00:00.000Z" }],
        comments: [{ author: "renovate[bot]", authorActor: bot, bodyText: "bump", createdAt: "2026-04-20T11:00:00.000Z", updatedAt: null, url: null }],
      }),
    ];
    const root = await mkdtemp(join(tmpdir(), "gh-insights-trend-"));
    const dwhDir = join(root, "dwh");
    try {
      await buildDwhFromPullRequests(prs, { dwhDir, botPatterns: ["\\[bot\\]$"] });

      const withBots = await withDwh(dwhDir, (runner) => queryActivityTrend(runner, resolveScope({ includeBots: true })));
      expect(withBots.buckets[0]).toMatchObject({ prOpened: 1, reviews: 1, comments: 1 });

      const withoutBots = await withDwh(dwhDir, (runner) => queryActivityTrend(runner, resolveScope({ includeBots: false })));
      expect(withoutBots.buckets[0]).toMatchObject({ prOpened: 1, reviews: 0, comments: 0 });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("buckets by day and by month", async () => {
    const prs = [
      pr(1, { created: "2026-04-20T00:00:00.000Z" }),
      pr(2, { created: "2026-04-21T00:00:00.000Z" }), // next day, same month
    ];
    const root = await mkdtemp(join(tmpdir(), "gh-insights-trend-"));
    const dwhDir = join(root, "dwh");
    try {
      await buildDwhFromPullRequests(prs, { dwhDir, botPatterns: [] });

      const byDay = await withDwh(dwhDir, (runner) => queryActivityTrend(runner, resolveScope({ grain: "day" })));
      expect(byDay.buckets.map((b) => b.bucket)).toEqual([
        "2026-04-20T00:00:00.000Z",
        "2026-04-21T00:00:00.000Z",
      ]);
      expect(byDay.buckets.every((b) => b.prOpened === 1)).toBe(true);

      const byMonth = await withDwh(dwhDir, (runner) => queryActivityTrend(runner, resolveScope({ grain: "month" })));
      expect(byMonth.buckets).toHaveLength(1);
      expect(byMonth.buckets[0]).toMatchObject({ bucket: "2026-04-01T00:00:00.000Z", prOpened: 2 });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
